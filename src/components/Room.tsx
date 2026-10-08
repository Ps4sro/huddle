import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { CallEngine } from '../lib/CallEngine';
import type { ToastMessage } from './Toast';
import { BackgroundKeeper } from '../lib/background';
import { isPipSupported, stopSilentAudioKeepAlive, togglePictureInPicture } from '../lib/audioKeeper';
import { roomUrl } from '../lib/rooms';
import { isMobile } from '../lib/media';
import { useAudioLevels, type AudioSource } from '../hooks/useAudioLevels';
import { useGridLayout } from '../hooks/useGridLayout';
import { VideoTile } from './VideoTile';
import { Controls } from './Controls';
import { ToastContainer } from './Toast';
import { LinkIcon, PipIcon, UsersIcon } from './Icons';

export type RoomProps = {
  engine: CallEngine;
  onLeave: () => void;
};

export function Room({ engine, onLeave }: RoomProps) {
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [pipAvailable] = useState(() => isPipSupported());
  const [showBgBanner, setShowBgBanner] = useState(() => isMobile);

  const gridRef = useRef<HTMLDivElement | null>(null);
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const bgKeeperRef = useRef<BackgroundKeeper | null>(null);

  const addToast = useCallback((text: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  // Listen for engine events (peer join / leave / errors)
  useEffect(() => {
    return engine.onEvent((event) => {
      if (event.type === 'peer-joined') {
        addToast(`${event.name} joined`);
      } else if (event.type === 'peer-left') {
        addToast(`${event.name} left`);
      } else if (event.type === 'media-error') {
        addToast(`⚠️ ${event.message}`);
      }
    });
  }, [engine, addToast]);

  // Manage BackgroundKeeper for MediaSession and WakeLock
  useEffect(() => {
    const keeper = new BackgroundKeeper();
    bgKeeperRef.current = keeper;

    keeper.start({
      toggleMic: () => engine.toggleAudio(),
      toggleCamera: () => engine.toggleVideo(),
      hangUp: () => handleLeave(),
      enterPip: () => handleTogglePip(),
    });

    return () => {
      keeper.stop();
      bgKeeperRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // Update MediaSession metadata when participant count or media changes
  useEffect(() => {
    const totalCount = snapshot.participants.length + 1;
    bgKeeperRef.current?.update({
      roomId: snapshot.roomId,
      count: totalCount,
      audioEnabled: snapshot.local.audioEnabled,
      videoEnabled: snapshot.local.videoEnabled,
    });
  }, [snapshot.roomId, snapshot.participants.length, snapshot.local.audioEnabled, snapshot.local.videoEnabled]);

  // Audio level tracking for speaking glow and active speaker selection
  const audioSources: AudioSource[] = useMemo(() => {
    const list: AudioSource[] = [];
    if (snapshot.local.previewStream) {
      list.push({
        id: 'local',
        stream: snapshot.local.previewStream,
        muted: !snapshot.local.audioEnabled,
      });
    }
    for (const p of snapshot.participants) {
      list.push({
        id: p.id,
        stream: p.stream,
        muted: !p.audioEnabled,
      });
    }
    return list;
  }, [snapshot.local.previewStream, snapshot.local.audioEnabled, snapshot.participants]);

  const { speaking, activeSpeaker } = useAudioLevels(audioSources);

  // Compute optimal video grid tile sizes
  const totalCount = snapshot.participants.length + 1;
  const layout = useGridLayout(gridRef, totalCount, 12);

  // Copy room link to clipboard
  const handleCopyLink = useCallback(async () => {
    const url = roomUrl(snapshot.roomId);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      addToast('Room link copied to clipboard!');
    } catch {
      addToast(`Share link: ${url}`);
    }
  }, [snapshot.roomId, addToast]);

  // Picture-in-Picture trigger (helps audio/video survive app switching on phones)
  const handleTogglePip = useCallback(async () => {
    // Pick the active speaker's video, or any available video
    let targetEl: HTMLVideoElement | null = null;
    if (activeSpeaker && videoElementsRef.current.has(activeSpeaker)) {
      targetEl = videoElementsRef.current.get(activeSpeaker)!;
    } else {
      // Pick first remote or local video element
      for (const el of videoElementsRef.current.values()) {
        if (el && el.readyState >= 2) {
          targetEl = el;
          break;
        }
      }
    }
    if (targetEl) {
      await togglePictureInPicture(targetEl);
    } else {
      addToast('Start camera to enable Picture-in-Picture');
    }
  }, [activeSpeaker, addToast]);

  const handleLeave = useCallback(() => {
    stopSilentAudioKeepAlive();
    engine.leave();
    onLeave();
  }, [engine, onLeave]);

  const registerVideoRef = useCallback((id: string, el: HTMLVideoElement | null) => {
    if (el) {
      videoElementsRef.current.set(id, el);
    } else {
      videoElementsRef.current.delete(id);
    }
  }, []);

  return (
    <div className="room-container">
      <ToastContainer toasts={toasts} />

      {/* Top Header */}
      <header className="room-header">
        <div className="room-info-pill">
          <span style={{ fontWeight: 600 }}>{snapshot.roomId}</span>
          <span className="badge-tag">
            <UsersIcon width={13} height={13} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 3 }} />
            {totalCount}
          </span>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="pill-btn"
            onClick={handleCopyLink}
            aria-label="Copy meeting link"
          >
            <LinkIcon width={15} height={15} />
            <span>Copy Link</span>
          </button>
        </div>
      </header>

      {/* Mobile Background Audio Guidance Banner */}
      {showBgBanner && pipAvailable && (
        <div className="bg-notice-banner">
          <span>
            📱 <strong>Multitasking tip:</strong> Pop out Picture-in-Picture so you can switch apps without losing audio!
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              type="button"
              className="bg-notice-btn"
              onClick={handleTogglePip}
            >
              <PipIcon width={12} height={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 3 }} />
              Pop Out
            </button>
            <button
              type="button"
              onClick={() => setShowBgBanner(false)}
              style={{ color: '#94a3b8', fontSize: '0.8rem', padding: '2px 6px' }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Video Grid Viewport */}
      <main className="grid-viewport" ref={gridRef}>
        <div
          className="video-grid"
          style={{
            gridTemplateColumns: `repeat(${layout.cols}, ${layout.tileW > 0 ? `${layout.tileW}px` : '1fr'})`,
          }}
        >
          {/* Local participant tile */}
          <VideoTile
            id="local"
            name={snapshot.name}
            stream={snapshot.local.previewStream}
            isLocal={true}
            audioEnabled={snapshot.local.audioEnabled}
            videoEnabled={snapshot.local.videoEnabled}
            screenSharing={snapshot.local.screenSharing}
            isSpeaking={speaking.has('local')}
            style={layout.tileH > 0 ? { height: `${layout.tileH}px` } : undefined}
            onVideoRef={(el) => registerVideoRef('local', el)}
          />

          {/* Remote participants */}
          {snapshot.participants.map((p) => (
            <VideoTile
              key={p.id}
              id={p.id}
              name={p.name}
              stream={p.stream}
              isLocal={false}
              audioEnabled={p.audioEnabled}
              videoEnabled={p.videoEnabled}
              screenSharing={p.screenSharing}
              isSpeaking={speaking.has(p.id)}
              connection={p.connection}
              style={layout.tileH > 0 ? { height: `${layout.tileH}px` } : undefined}
              onVideoRef={(el) => registerVideoRef(p.id, el)}
            />
          ))}
        </div>
      </main>

      {/* Control Dock */}
      <Controls
        local={snapshot.local}
        onToggleMic={() => engine.toggleAudio()}
        onToggleCam={() => engine.toggleVideo()}
        onFlipCam={() => engine.flipCamera()}
        onToggleScreenShare={() => engine.toggleScreenShare()}
        onTogglePip={handleTogglePip}
        onCopyLink={handleCopyLink}
        onLeave={handleLeave}
        pipAvailable={pipAvailable}
      />
    </div>
  );
}
