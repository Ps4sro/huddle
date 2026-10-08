/**
 * Everything that helps the call survive app-switching / screen-off on phones.
 *
 * - Screen Wake Lock: stops the phone from auto-locking mid-call.
 * - Media Session: registers the call as active media with the OS (lock screen /
 *   notification controls, and Chrome's auto Picture-in-Picture when you switch tabs).
 * - A shared, user-gesture-unlocked AudioContext: keeps the page's audio session
 *   "hot" and powers the speaking indicators.
 */

type WakeLockSentinelLike = { release: () => Promise<void>; released?: boolean };

let audioCtx: AudioContext | null = null;

/** Must be called from inside a click/tap handler. */
export function unlockAudio(): AudioContext | null {
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state !== 'running') void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

export function getAudioContext(): AudioContext | null {
  return audioCtx;
}

export type MediaSessionHandlers = {
  toggleMic: () => void;
  toggleCamera: () => void;
  hangUp: () => void;
  enterPip?: () => void;
};

function setAction(action: string, handler: (() => void) | null) {
  try {
    // Video-conferencing actions aren't in older TS lib typings.
    (navigator.mediaSession as unknown as {
      setActionHandler: (a: string, h: (() => void) | null) => void;
    }).setActionHandler(action, handler);
  } catch {
    /* action unsupported in this browser */
  }
}

export class BackgroundKeeper {
  private wakeLock: WakeLockSentinelLike | null = null;
  private active = false;
  private onVisibility = () => {
    if (document.visibilityState === 'visible' && this.active) {
      void this.requestWakeLock();
      if (audioCtx && audioCtx.state !== 'running') void audioCtx.resume();
    }
  };

  start(handlers: MediaSessionHandlers) {
    this.active = true;
    void this.requestWakeLock();
    document.addEventListener('visibilitychange', this.onVisibility);

    if ('mediaSession' in navigator) {
      setAction('togglemicrophone', handlers.toggleMic);
      setAction('togglecamera', handlers.toggleCamera);
      setAction('hangup', handlers.hangUp);
      if (handlers.enterPip) setAction('enterpictureinpicture', handlers.enterPip);
      try {
        navigator.mediaSession.playbackState = 'playing';
      } catch {
        /* ignore */
      }
    }
  }

  update(opts: { roomId: string; count: number; audioEnabled: boolean; videoEnabled: boolean }) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `Huddle · ${opts.roomId}`,
        artist: opts.count === 1 ? 'Waiting for friends…' : `${opts.count} people in call`,
        artwork: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      });
      const ms = navigator.mediaSession as unknown as {
        setMicrophoneActive?: (a: boolean) => void;
        setCameraActive?: (a: boolean) => void;
      };
      ms.setMicrophoneActive?.(opts.audioEnabled);
      ms.setCameraActive?.(opts.videoEnabled);
    } catch {
      /* ignore */
    }
  }

  stop() {
    this.active = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    void this.wakeLock?.release().catch(() => {});
    this.wakeLock = null;
    if ('mediaSession' in navigator) {
      for (const a of ['togglemicrophone', 'togglecamera', 'hangup', 'enterpictureinpicture']) setAction(a, null);
      try {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      } catch {
        /* ignore */
      }
    }
  }

  private async requestWakeLock() {
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } }).wakeLock;
    if (!wl || document.visibilityState !== 'visible') return;
    if (this.wakeLock && !this.wakeLock.released) return;
    try {
      this.wakeLock = await wl.request('screen');
    } catch {
      /* battery saver or unsupported */
    }
  }
}
