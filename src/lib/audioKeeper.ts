/**
 * Generates a valid 3-second PCM silent WAV Blob.
 * 
 * Mobile Safari & Android Chrome aggressively ignore micro-second (1-sample) audio files
 * as empty/inactive. A legitimate 3-second duration audio stream forces the mobile OS
 * audio engine to treat the tab as an active continuous media playback session, keeping
 * the background WebRTC audio pipeline alive when switching apps or locking the screen.
 */
function createSilentWavBlob(durationSeconds = 3, sampleRate = 8000): Blob {
  const numChannels = 1;
  const bytesPerSample = 1; // 8-bit PCM
  const numFrames = sampleRate * durationSeconds;
  const dataSize = numFrames * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // RIFF container
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  // fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true); // ByteRate
  view.setUint16(32, numChannels * bytesPerSample, true); // BlockAlign
  view.setUint16(34, 8, true); // BitsPerSample (8-bit)

  // data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // 8-bit PCM audio silence is encoded as mid-scale (value 128 / 0x80)
  new Uint8Array(buffer, 44, dataSize).fill(128);

  return new Blob([buffer], { type: 'audio/wav' });
}

let silentAudioEl: HTMLAudioElement | null = null;
let silentBlobUrl: string | null = null;

/**
 * Starts playing a silent audio track in an invisible <audio loop> element.
 * MUST be invoked directly from a user tap/click handler (e.g. Join Call).
 */
export function startSilentAudioKeepAlive(): void {
  try {
    if (!silentAudioEl) {
      if (!silentBlobUrl) {
        const blob = createSilentWavBlob(3, 8000);
        silentBlobUrl = URL.createObjectURL(blob);
      }
      silentAudioEl = new Audio(silentBlobUrl);
      silentAudioEl.loop = true;
      silentAudioEl.autoplay = true;
      silentAudioEl.volume = 0.01;
      (silentAudioEl as unknown as { playsInline?: boolean }).playsInline = true;

      // Ensure it stays looping if interrupted
      silentAudioEl.addEventListener('pause', () => {
        if (silentAudioEl && document.visibilityState === 'hidden') {
          void silentAudioEl.play().catch(() => {});
        }
      });
    }
    void silentAudioEl.play().catch(() => {});
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
    if (silentBlobUrl) {
      URL.revokeObjectURL(silentBlobUrl);
      silentBlobUrl = null;
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
