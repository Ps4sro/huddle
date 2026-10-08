// 44-byte standard PCM silent WAV file (1 sample, 8000Hz, mono)
export const SILENT_AUDIO_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

let silentAudioEl: HTMLAudioElement | null = null;

/**
 * Starts playing a silent audio track in an invisible <audio loop> element.
 * MUST be invoked directly from a user tap/click handler (e.g. Join Call).
 *
 * This marks the browser tab as an active media playback session with iOS Safari
 * and Android OS, preventing the browser from cutting off incoming WebRTC audio
 * when the user switches to other apps or locks the screen.
 */
export function startSilentAudioKeepAlive(): void {
  try {
    if (!silentAudioEl) {
      silentAudioEl = new Audio(SILENT_AUDIO_URI);
      silentAudioEl.loop = true;
      silentAudioEl.autoplay = true;
      silentAudioEl.volume = 0.01; // Tiny volume ensures OS audio mixer treats it as active
      // iOS Safari requires playsinline
      (silentAudioEl as unknown as { playsInline?: boolean }).playsInline = true;
    }
    void silentAudioEl.play().catch(() => {
      // Autoplay might be blocked if called outside a user gesture
    });
  } catch {
    /* ignore */
  }
}

export function stopSilentAudioKeepAlive(): void {
  try {
    if (silentAudioEl) {
      silentAudioEl.pause();
      silentAudioEl.currentTime = 0;
      silentAudioEl = null;
    }
  } catch {
    /* ignore */
  }
}

/**
 * Requests Picture-in-Picture on a video element.
 * Works across desktop Chrome/Firefox/Safari and mobile Safari/Chrome.
 */
export async function togglePictureInPicture(videoEl: HTMLVideoElement): Promise<boolean> {
  try {
    // Standard W3C API
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return false;
    }
    if (videoEl.requestPictureInPicture) {
      await videoEl.requestPictureInPicture();
      return true;
    }
    // Safari / iOS WebKit prefix
    const webkitEl = videoEl as unknown as {
      webkitSupportsPresentationMode?: (mode: string) => boolean;
      webkitPresentationMode?: string;
      webkitSetPresentationMode?: (mode: string) => void;
    };
    if (webkitEl.webkitSupportsPresentationMode && webkitEl.webkitSupportsPresentationMode('picture-in-picture')) {
      const current = webkitEl.webkitPresentationMode;
      const next = current === 'picture-in-picture' ? 'inline' : 'picture-in-picture';
      webkitEl.webkitSetPresentationMode?.(next);
      return next === 'picture-in-picture';
    }
  } catch (err) {
    console.warn('[PiP] could not toggle Picture-in-Picture:', err);
  }
  return false;
}

export function isPipSupported(): boolean {
  if (typeof document === 'undefined') return false;
  if ('pictureInPictureEnabled' in document && document.pictureInPictureEnabled) return true;
  const dummy = document.createElement('video') as unknown as {
    webkitSupportsPresentationMode?: (m: string) => boolean;
  };
  return typeof dummy.webkitSupportsPresentationMode === 'function';
}
