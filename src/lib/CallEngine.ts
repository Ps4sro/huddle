import { io, type Socket } from 'socket.io-client';
import type {
  CallEvent,
  CallSnapshot,
  ConnectionStatus,
  FacingMode,
  JoinAck,
  LocalState,
  MediaState,
  PeerInfo,
  RemoteParticipant,
  SignalData,
} from '../types';
import type { ChatMessage, ReactionEvent } from './chat';
import { AUDIO_CONSTRAINTS, canScreenShare, countCameras, getCameraTrack, getMicTrack, isMobile } from './media';

/**
 * CallEngine — owns the socket, every RTCPeerConnection, and local media.
 *
 * Topology: full mesh. Each pair of browsers has one RTCPeerConnection with exactly
 * one audio + one video transceiver. The person who *joins* creates the transceivers
 * and sends the offer; the person already in the room answers and attaches its tracks
 * to the transceivers the offer created. After that, every media change (mute,
 * camera off, flip camera, screen share) is done with `replaceTrack`, so we never
 * need to renegotiate — which keeps things fast and glitch-free on flaky mobile links.
 *
 * Negotiation follows the "perfect negotiation" pattern anyway, so ICE restarts and
 * any unexpected glare are handled safely.
 */

type Peer = {
  id: string;
  name: string;
  pc: RTCPeerConnection;
  polite: boolean;
  initiator: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  settingRemoteAnswer: boolean;
  queue: Promise<void>;
  audioTx: RTCRtpTransceiver | null;
  videoTx: RTCRtpTransceiver | null;
  stream: MediaStream;
  media: MediaState;
  connection: ConnectionStatus;
  restartTimer: number | null;
};

type Listener = () => void;
type EventListener = (e: CallEvent) => void;

export type CallEngineOptions = {
  roomId: string;
  name: string;
  audioTrack: MediaStreamTrack | null;
  videoTrack: MediaStreamTrack | null;
  audioEnabled: boolean;
  videoEnabled: boolean;
  facingMode: FacingMode;
};

const DISCONNECT_GRACE_MS = 4000;

export class CallEngine {
  readonly roomId: string;
  readonly name: string;
  /** Survives socket reconnects so the server can evict our stale ghost socket. */
  private readonly clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);

  private socket: Socket | null = null;
  private selfId: string | null = null;
  private iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  private peers = new Map<string, Peer>();

  private audioTrack: MediaStreamTrack | null;
  private cameraTrack: MediaStreamTrack | null;
  private screenTrack: MediaStreamTrack | null = null;
  private audioEnabled: boolean;
  private videoEnabled: boolean;
  private facingMode: FacingMode;
  private canFlip = isMobile;
  /** Tracks we stopped on purpose, so their `ended` event isn't treated as a loss. */
  private intentionallyStopped = new WeakSet<MediaStreamTrack>();
  private mediaBusy = false;

  private status: CallSnapshot['status'] = 'joining';
  private error: CallSnapshot['error'] = null;
  private snapshot: CallSnapshot;
  private listeners = new Set<Listener>();
  private eventListeners = new Set<EventListener>();
  private emitScheduled = false;

  constructor(opts: CallEngineOptions) {
    this.roomId = opts.roomId;
    this.name = opts.name;
    this.audioTrack = opts.audioTrack;
    this.cameraTrack = opts.videoEnabled ? opts.videoTrack : null;
    if (!opts.videoEnabled && opts.videoTrack) this.stopTrack(opts.videoTrack);
    this.audioEnabled = opts.audioEnabled && !!opts.audioTrack;
    this.videoEnabled = opts.videoEnabled && !!this.cameraTrack;
    this.facingMode = opts.facingMode;
    if (this.audioTrack) {
      this.audioTrack.enabled = this.audioEnabled;
      this.watchTrack(this.audioTrack, 'audio');
    }
    if (this.cameraTrack) this.watchTrack(this.cameraTrack, 'video');
    this.snapshot = this.buildSnapshot();
  }

  // ───────────────────────────── public API ─────────────────────────────

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.snapshot;

  onEvent(fn: EventListener) {
    this.eventListeners.add(fn);
    return () => {
      this.eventListeners.delete(fn);
    };
  }

  start() {
    if (this.socket) return;
    const socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
    });
    this.socket = socket;

    socket.on('connect', () => this.join());
    socket.on('disconnect', () => {
      if (this.status === 'left') return;
      this.status = 'reconnecting';
      this.emit();
    });
    socket.on('peer-joined', (info: PeerInfo) => {
      const existing = this.peers.get(info.id);
      if (existing) this.closePeer(existing.id, false);
      this.createPeer(info, false);
      this.fire({ type: 'peer-joined', name: info.name });
      this.applyBitrates();
      this.emit();
    });
    socket.on('peer-left', ({ id }: { id: string }) => {
      const peer = this.peers.get(id);
      if (!peer) return;
      this.closePeer(id, true);
      this.applyBitrates();
    });
    socket.on('peer-media-state', (msg: MediaState & { id: string }) => {
      const peer = this.peers.get(msg.id);
      if (!peer) return;
      peer.media = {
        audioEnabled: !!msg.audioEnabled,
        videoEnabled: !!msg.videoEnabled,
        screenSharing: !!msg.screenSharing,
      };
      this.emit();
    });
    socket.on('signal', ({ from, data }: { from: string; data: SignalData }) => {
      let peer = this.peers.get(from);
      if (!peer) {
        // Signal raced ahead of peer-joined; create a placeholder answerer.
        peer = this.createPeer(
          { id: from, name: 'Guest', audioEnabled: true, videoEnabled: true, screenSharing: false },
          false,
        );
      }
      const p = peer;
      p.queue = p.queue.then(() => this.handleSignal(p, data)).catch((err) => console.warn('[signal]', err));
    });
    socket.on('chat-message', (msg: any) => {
      this.fire({
        type: 'chat-message',
        message: {
          id: msg.id,
          senderId: msg.senderId,
          senderName: msg.senderName,
          text: msg.text,
          timestamp: msg.timestamp,
          isLocal: false,
        },
      });
    });
    socket.on('reaction', (r: any) => {
      this.fire({
        type: 'reaction',
        reaction: {
          id: r.id,
          senderId: r.senderId,
          senderName: r.senderName,
          emoji: r.emoji,
          xPercent: r.xPercent ?? Math.floor(20 + Math.random() * 60),
          timestamp: r.timestamp,
        },
      });
    });

    void countCameras().then((n) => {
      this.canFlip = isMobile || n > 1;
      this.emit();
    });
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('online', this.onOnline);
  }

  leave() {
    if (this.status === 'left') return;
    this.status = 'left';
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('online', this.onOnline);
    for (const id of [...this.peers.keys()]) this.closePeer(id, false);
    if (this.socket) {
      this.socket.emit('leave');
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    for (const t of [this.audioTrack, this.cameraTrack, this.screenTrack]) if (t) this.stopTrack(t);
    this.audioTrack = this.cameraTrack = this.screenTrack = null;
    this.emit();
  }

  async toggleAudio() {
    await this.setAudioEnabled(!this.audioEnabled);
  }

  async setAudioEnabled(enabled: boolean) {
    if (enabled && !this.audioTrack) {
      try {
        this.audioTrack = await getMicTrack();
        this.watchTrack(this.audioTrack, 'audio');
        await this.replaceOutgoing('audio');
      } catch {
        this.fire({ type: 'media-error', message: 'Could not access your microphone.' });
        return;
      }
    }
    this.audioEnabled = enabled;
    // Muting via `enabled=false` sends silence without renegotiating and unmutes instantly.
    if (this.audioTrack) this.audioTrack.enabled = enabled;
    this.broadcastMediaState();
    this.emit();
  }

  async toggleVideo() {
    await this.setVideoEnabled(!this.videoEnabled);
  }

  async setVideoEnabled(enabled: boolean) {
    if (this.mediaBusy || enabled === this.videoEnabled) return;
    this.mediaBusy = true;
    try {
      if (enabled) {
        const track = await getCameraTrack(this.facingMode);
        this.cameraTrack = track;
        this.watchTrack(track, 'video');
      } else if (this.cameraTrack) {
        // Fully stop the camera so the hardware light turns off.
        this.stopTrack(this.cameraTrack);
        this.cameraTrack = null;
      }
      this.videoEnabled = enabled;
      if (!this.screenTrack) await this.replaceOutgoing('video');
      this.broadcastMediaState();
    } catch {
      this.fire({ type: 'media-error', message: 'Could not access your camera.' });
    } finally {
      this.mediaBusy = false;
      this.emit();
    }
  }

  async flipCamera() {
    if (this.mediaBusy || !this.cameraTrack) return;
    this.mediaBusy = true;
    const next: FacingMode = this.facingMode === 'user' ? 'environment' : 'user';
    try {
      // Phones can't open two cameras at once — release the current one first.
      this.stopTrack(this.cameraTrack);
      this.cameraTrack = null;
      let track: MediaStreamTrack;
      try {
        track = await getCameraTrack(next);
        this.facingMode = next;
      } catch {
        track = await getCameraTrack(this.facingMode);
      }
      this.cameraTrack = track;
      this.watchTrack(track, 'video');
      if (!this.screenTrack) await this.replaceOutgoing('video');
    } catch {
      this.videoEnabled = false;
      this.broadcastMediaState();
      this.fire({ type: 'media-error', message: 'Could not switch cameras.' });
    } finally {
      this.mediaBusy = false;
      this.emit();
    }
  }

  async toggleScreenShare() {
    if (this.screenTrack) return this.stopScreenShare();
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
      });
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      try {
        track.contentHint = 'detail';
      } catch {
        /* ignore */
      }
      this.screenTrack = track;
      track.addEventListener('ended', () => {
        if (this.screenTrack === track) void this.stopScreenShare();
      });
      await this.replaceOutgoing('video');
      this.applyBitrates();
      this.broadcastMediaState();
      this.emit();
    } catch {
      /* user cancelled the picker */
    }
  }

  private async stopScreenShare() {
    if (!this.screenTrack) return;
    this.stopTrack(this.screenTrack);
    this.screenTrack = null;
    await this.replaceOutgoing('video');
    this.applyBitrates();
    this.broadcastMediaState();
    this.emit();
  }

  sendChatMessage(text: string) {
    const trimmed = text.trim();
    if (!this.socket || !trimmed) return;
    const msgId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const msg: ChatMessage = {
      id: msgId,
      senderId: this.selfId ?? 'local',
      senderName: this.name,
      text: trimmed,
      timestamp: Date.now(),
      isLocal: true,
    };
    this.socket.emit('chat-message', { id: msgId, text: trimmed });
    this.fire({ type: 'chat-message', message: msg });
  }

  sendReaction(emoji: string) {
    const trimmed = emoji.trim();
    if (!this.socket || !trimmed) return;
    const reactionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const xPercent = Math.floor(20 + Math.random() * 60);
    const reaction: ReactionEvent = {
      id: reactionId,
      senderId: this.selfId ?? 'local',
      senderName: this.name,
      emoji: trimmed,
      xPercent,
      timestamp: Date.now(),
    };
    this.socket.emit('reaction', { id: reactionId, emoji: trimmed, xPercent });
    this.fire({ type: 'reaction', reaction });
  }

  async setAudioInputDevice(deviceId: string) {
    if (this.mediaBusy) return;
    this.mediaBusy = true;
    try {
      if (this.audioTrack) {
        this.stopTrack(this.audioTrack);
        this.audioTrack = null;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { ...AUDIO_CONSTRAINTS, deviceId: { exact: deviceId } },
      });
      const track = stream.getAudioTracks()[0];
      if (track) {
        track.enabled = this.audioEnabled;
        this.audioTrack = track;
        this.watchTrack(track, 'audio');
        await this.replaceOutgoing('audio');
      }
    } catch {
      this.fire({ type: 'media-error', message: 'Could not switch microphone.' });
    } finally {
      this.mediaBusy = false;
      this.emit();
    }
  }

  async setVideoInputDevice(deviceId: string) {
    if (this.mediaBusy || !this.videoEnabled) return;
    this.mediaBusy = true;
    try {
      if (this.cameraTrack) {
        this.stopTrack(this.cameraTrack);
        this.cameraTrack = null;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 960 }, height: { ideal: 540 } },
      });
      const track = stream.getVideoTracks()[0];
      if (track) {
        this.cameraTrack = track;
        this.watchTrack(track, 'video');
        if (!this.screenTrack) await this.replaceOutgoing('video');
      }
    } catch {
      this.fire({ type: 'media-error', message: 'Could not switch camera.' });
    } finally {
      this.mediaBusy = false;
      this.emit();
    }
  }

  // ───────────────────────────── signaling ─────────────────────────────

  private join() {
    const socket = this.socket;
    if (!socket) return;
    const payload = {
      roomId: this.roomId,
      name: this.name,
      clientId: this.clientId,
      audioEnabled: this.audioEnabled,
      videoEnabled: this.videoEnabled || !!this.screenTrack,
    };
    socket.timeout(10000).emit('join', payload, (err: Error | null, ack: JoinAck) => {
      if (this.status === 'left') return;
      if (err) {
        // Timed out; socket.io will keep retrying the connection.
        this.error = 'timeout';
        this.status = 'reconnecting';
        this.emit();
        return;
      }
      if (!ack.ok) {
        this.status = 'error';
        this.error = ack.error;
        this.emit();
        return;
      }
      // Fresh socket id (first join or a reconnect) — rebuild every connection.
      for (const id of [...this.peers.keys()]) this.closePeer(id, false);
      this.selfId = ack.selfId;
      if (ack.iceServers?.length) this.iceServers = ack.iceServers;
      this.status = 'joined';
      this.error = null;
      for (const info of ack.peers) this.createPeer(info, true);
      if (this.screenTrack) this.broadcastMediaState();
      this.applyBitrates();
      this.emit();
    });
  }

  private send(to: string, data: SignalData) {
    this.socket?.emit('signal', { to, data });
  }

  private broadcastMediaState() {
    this.socket?.emit('media-state', {
      audioEnabled: this.audioEnabled,
      videoEnabled: this.videoEnabled,
      screenSharing: !!this.screenTrack,
    } satisfies MediaState);
  }

  private async handleSignal(peer: Peer, data: SignalData) {
    if (!this.peers.has(peer.id)) return;
    const pc = peer.pc;
    if ('description' in data && data.description) {
      const description = data.description;
      const readyForOffer =
        !peer.makingOffer && (pc.signalingState === 'stable' || peer.settingRemoteAnswer);
      const offerCollision = description.type === 'offer' && !readyForOffer;
      peer.ignoreOffer = !peer.polite && offerCollision;
      if (peer.ignoreOffer) return;

      if (offerCollision) {
        // Polite peer: back out of our own offer and accept theirs.
        await pc.setLocalDescription({ type: 'rollback' }).catch(() => {});
      }
      peer.settingRemoteAnswer = description.type === 'answer';
      await pc.setRemoteDescription(description);
      peer.settingRemoteAnswer = false;

      if (description.type === 'offer') {
        await this.attachToOfferedTransceivers(peer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (pc.localDescription) this.send(peer.id, { description: pc.localDescription.toJSON() });
      }
    } else if ('candidate' in data && data.candidate) {
      try {
        await pc.addIceCandidate(data.candidate);
      } catch (err) {
        if (!peer.ignoreOffer) console.warn('[ice] failed to add candidate', err);
      }
    }
  }

  // ───────────────────────────── peers ─────────────────────────────

  private createPeer(info: PeerInfo, initiator: boolean): Peer {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: 'max-bundle' });
    const peer: Peer = {
      id: info.id,
      name: info.name,
      pc,
      polite: (this.selfId ?? '') < info.id,
      initiator,
      makingOffer: false,
      ignoreOffer: false,
      settingRemoteAnswer: false,
      queue: Promise.resolve(),
      audioTx: null,
      videoTx: null,
      stream: new MediaStream(),
      media: {
        audioEnabled: !!info.audioEnabled,
        videoEnabled: !!info.videoEnabled,
        screenSharing: !!info.screenSharing,
      },
      connection: 'connecting',
      restartTimer: null,
    };
    this.peers.set(info.id, peer);

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.send(peer.id, { candidate: candidate.toJSON() });
    };

    pc.ontrack = ({ track }) => {
      const others = peer.stream.getTracks().filter((t) => t.kind !== track.kind);
      // New MediaStream object so <video>/<audio> elements reliably pick up the change.
      peer.stream = new MediaStream([...others, track]);
      track.addEventListener('unmute', () => this.emit());
      this.emit();
    };

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        if (pc.localDescription) this.send(peer.id, { description: pc.localDescription.toJSON() });
      } catch (err) {
        console.warn('[negotiation]', err);
      } finally {
        peer.makingOffer = false;
      }
    };

    pc.oniceconnectionstatechange = () => this.onIceState(peer);

    if (initiator) {
      peer.audioTx = pc.addTransceiver(this.audioTrack ?? 'audio', { direction: 'sendrecv' });
      peer.videoTx = pc.addTransceiver(this.outgoingVideo() ?? 'video', { direction: 'sendrecv' });
    }
    return peer;
  }

  /** Answerer side: reuse the transceivers the remote offer created, so there's 1 audio + 1 video m-line. */
  private async attachToOfferedTransceivers(peer: Peer) {
    for (const tx of peer.pc.getTransceivers()) {
      const kind = tx.receiver.track?.kind;
      if (kind === 'audio' && !peer.audioTx) peer.audioTx = tx;
      else if (kind === 'video' && !peer.videoTx) peer.videoTx = tx;
      else continue;
      tx.direction = 'sendrecv';
      await tx.sender.replaceTrack(kind === 'audio' ? this.audioTrack : this.outgoingVideo());
    }
  }

  private onIceState(peer: Peer) {
    const state = peer.pc.iceConnectionState;
    const clear = () => {
      if (peer.restartTimer !== null) window.clearTimeout(peer.restartTimer);
      peer.restartTimer = null;
    };
    if (state === 'connected' || state === 'completed') {
      clear();
      peer.connection = 'connected';
      this.applyBitrate(peer);
    } else if (state === 'disconnected') {
      // Common on mobile when switching Wi-Fi ↔ cellular; often recovers by itself.
      peer.connection = 'reconnecting';
      clear();
      peer.restartTimer = window.setTimeout(() => this.restartIce(peer), DISCONNECT_GRACE_MS);
    } else if (state === 'failed') {
      peer.connection = 'reconnecting';
      clear();
      this.restartIce(peer);
    }
    this.emit();
  }

  private restartIce(peer: Peer) {
    if (!this.peers.has(peer.id) || !peer.initiator) return;
    const s = peer.pc.iceConnectionState;
    if (s === 'connected' || s === 'completed') return;
    if (typeof peer.pc.restartIce === 'function') {
      peer.pc.restartIce();
    } else {
      void (async () => {
        try {
          peer.makingOffer = true;
          const offer = await peer.pc.createOffer({ iceRestart: true });
          await peer.pc.setLocalDescription(offer);
          if (peer.pc.localDescription) this.send(peer.id, { description: peer.pc.localDescription.toJSON() });
        } finally {
          peer.makingOffer = false;
        }
      })();
    }
  }

  private closePeer(id: string, announce: boolean) {
    const peer = this.peers.get(id);
    if (!peer) return;
    if (peer.restartTimer !== null) window.clearTimeout(peer.restartTimer);
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onnegotiationneeded = null;
    peer.pc.oniceconnectionstatechange = null;
    try {
      peer.pc.close();
    } catch {
      /* ignore */
    }
    this.peers.delete(id);
    if (announce) this.fire({ type: 'peer-left', name: peer.name });
    this.emit();
  }

  // ───────────────────────────── local media ─────────────────────────────

  private outgoingVideo(): MediaStreamTrack | null {
    return this.screenTrack ?? (this.videoEnabled ? this.cameraTrack : null);
  }

  private async replaceOutgoing(kind: 'audio' | 'video') {
    const track = kind === 'audio' ? this.audioTrack : this.outgoingVideo();
    await Promise.all(
      [...this.peers.values()].map(async (peer) => {
        const tx = kind === 'audio' ? peer.audioTx : peer.videoTx;
        if (!tx) return;
        try {
          await tx.sender.replaceTrack(track);
        } catch (err) {
          console.warn('[replaceTrack]', err);
        }
      }),
    );
  }

  /** Mesh = one upload per friend. Scale bitrate down as the room grows. */
  private applyBitrates() {
    for (const peer of this.peers.values()) this.applyBitrate(peer);
  }

  private applyBitrate(peer: Peer) {
    const sender = peer.videoTx?.sender;
    if (!sender) return;
    const n = this.peers.size;
    const maxBitrate = this.screenTrack ? 1_500_000 : n <= 1 ? 1_200_000 : n <= 3 ? 700_000 : 450_000;
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) return;
      if (params.encodings[0].maxBitrate === maxBitrate) return;
      params.encodings[0].maxBitrate = maxBitrate;
      void sender.setParameters(params).catch(() => {});
    } catch {
      /* not negotiated yet */
    }
  }

  private stopTrack(track: MediaStreamTrack) {
    this.intentionallyStopped.add(track);
    track.stop();
  }

  /**
   * iOS (and some Android browsers) kill the camera/mic when the app is backgrounded.
   * When that happens, we re-acquire as soon as the page is visible again and swap the
   * new track into every connection — no renegotiation, friends barely notice.
   */
  private watchTrack(track: MediaStreamTrack, kind: 'audio' | 'video') {
    track.addEventListener('ended', () => {
      if (this.intentionallyStopped.has(track) || this.status === 'left') return;
      if (kind === 'audio' && this.audioTrack === track) this.audioTrack = null;
      if (kind === 'video' && this.cameraTrack === track) this.cameraTrack = null;
      this.emit();
      if (document.visibilityState === 'visible') void this.restoreMedia();
    });
  }

  private restoring = false;

  private async restoreMedia() {
    if (this.restoring || this.status === 'left') return;
    this.restoring = true;
    try {
      if (this.audioEnabled) {
        if (!this.audioTrack || this.audioTrack.readyState === 'ended') {
          try {
            this.audioTrack = await getMicTrack();
            this.audioTrack.enabled = this.audioEnabled;
            this.watchTrack(this.audioTrack, 'audio');
            await this.replaceOutgoing('audio');
          } catch {
            /* will retry on next visibility change */
          }
        } else {
          // Re-affirm enabled state and re-pipe to RTCRtpSender to wake up WebKit audio pipeline
          this.audioTrack.enabled = false;
          this.audioTrack.enabled = true;
          await this.replaceOutgoing('audio');
        }
      }
      if (this.videoEnabled && !this.mediaBusy && (!this.cameraTrack || this.cameraTrack.readyState === 'ended')) {
        try {
          this.cameraTrack = await getCameraTrack(this.facingMode);
          this.watchTrack(this.cameraTrack, 'video');
          if (!this.screenTrack) await this.replaceOutgoing('video');
        } catch {
          /* will retry on next visibility change */
        }
      }
    } finally {
      this.restoring = false;
      this.emit();
    }
  }

  private onVisibility = () => {
    if (document.visibilityState !== 'visible' || this.status === 'left') return;
    void this.restoreMedia();
    if (this.socket && !this.socket.connected) this.socket.connect();
    // Nudge any connection that stalled while we were in the background.
    for (const peer of this.peers.values()) {
      const s = peer.pc.iceConnectionState;
      if (s === 'failed' || s === 'disconnected') this.restartIce(peer);
    }
  };

  private onOnline = () => {
    if (this.socket && !this.socket.connected) this.socket.connect();
    for (const peer of this.peers.values()) this.restartIce(peer);
  };

  // ───────────────────────────── snapshot plumbing ─────────────────────────────

  private fire(e: CallEvent) {
    for (const fn of this.eventListeners) fn(e);
  }

  private emit() {
    if (this.emitScheduled) return;
    this.emitScheduled = true;
    queueMicrotask(() => {
      this.emitScheduled = false;
      this.snapshot = this.buildSnapshot();
      for (const fn of this.listeners) fn();
    });
  }

  private previewStream: MediaStream | null = null;
  private previewTrack: MediaStreamTrack | null = null;

  private buildSnapshot(): CallSnapshot {
    const outgoing = this.outgoingVideo();
    const live = outgoing && outgoing.readyState === 'live' ? outgoing : null;
    if (live !== this.previewTrack) {
      this.previewTrack = live;
      this.previewStream = live ? new MediaStream([live]) : null;
    }
    const local: LocalState = {
      audioEnabled: this.audioEnabled,
      videoEnabled: this.videoEnabled,
      screenSharing: !!this.screenTrack,
      facingMode: this.facingMode,
      previewStream: this.previewStream,
      hasMic: !!this.audioTrack,
      canFlip: this.canFlip && this.videoEnabled && !this.screenTrack,
      canScreenShare,
    };
    const participants: RemoteParticipant[] = [...this.peers.values()].map((p) => ({
      id: p.id,
      name: p.name,
      stream: p.stream,
      audioEnabled: p.media.audioEnabled,
      videoEnabled: p.media.videoEnabled,
      screenSharing: p.media.screenSharing,
      connection: p.connection,
    }));
    return {
      status: this.status,
      error: this.error,
      selfId: this.selfId,
      roomId: this.roomId,
      name: this.name,
      participants,
      local,
    };
  }
}
