import type { FacingMode } from '../types';

export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export function videoConstraints(facingMode: FacingMode): MediaTrackConstraints {
  return {
    facingMode,
    // Mesh calls upload one copy per friend, so we keep capture modest.
    width: { ideal: 960 },
    height: { ideal: 540 },
    frameRate: { ideal: 24, max: 30 },
  };
}

export type MediaErrorKind = 'insecure' | 'unsupported' | 'denied' | 'notfound' | 'inuse' | 'unknown';

export function mediaSupport(): MediaErrorKind | null {
  if (!window.isSecureContext) return 'insecure';
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
  return null;
}

export function classifyMediaError(err: unknown): MediaErrorKind {
  const name = (err as { name?: string })?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'notfound';
    case 'NotReadableError':
    case 'AbortError':
      return 'inuse';
    default:
      return 'unknown';
  }
}

export function describeMediaError(kind: MediaErrorKind): string {
  switch (kind) {
    case 'insecure':
      return 'Camera and mic only work over HTTPS. Open the secure (https://) link.';
    case 'unsupported':
      return "This browser can't access your camera or mic. If you opened the link inside an app (Instagram, Snapchat, Messages preview…), open it in Safari or Chrome instead.";
    case 'denied':
      return 'Camera/mic permission was blocked. Allow it in your browser’s site settings (the icon next to the address bar), then reload.';
    case 'notfound':
      return 'No camera or microphone was found.';
    case 'inuse':
      return 'Your camera or mic is being used by another app. Close it and try again.';
    default:
      return 'Could not start your camera or mic.';
  }
}

export async function getMicTrack(): Promise<MediaStreamTrack> {
  const s = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
  return s.getAudioTracks()[0];
}

export async function getCameraTrack(facingMode: FacingMode): Promise<MediaStreamTrack> {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(facingMode) });
    return s.getVideoTracks()[0];
  } catch (err) {
    // Some laptops reject the facingMode hint; retry with no constraints.
    if (classifyMediaError(err) === 'notfound') {
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      return s.getVideoTracks()[0];
    }
    throw err;
  }
}

/**
 * Ask for camera + mic in a single prompt (nicer on iOS), and if that fails,
 * fall back to whichever one we can get.
 */
export async function acquireInitialMedia(facingMode: FacingMode): Promise<{
  audio: MediaStreamTrack | null;
  video: MediaStreamTrack | null;
  error: MediaErrorKind | null;
}> {
  const unsupported = mediaSupport();
  if (unsupported) return { audio: null, video: null, error: unsupported };

  try {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
      video: videoConstraints(facingMode),
    });
    return { audio: s.getAudioTracks()[0] ?? null, video: s.getVideoTracks()[0] ?? null, error: null };
  } catch (err) {
    const kind = classifyMediaError(err);
    let audio: MediaStreamTrack | null = null;
    let video: MediaStreamTrack | null = null;
    try {
      audio = await getMicTrack();
    } catch {
      /* ignore */
    }
    try {
      video = await getCameraTrack(facingMode);
    } catch {
      /* ignore */
    }
    return { audio, video, error: audio || video ? null : kind };
  }
}

export async function countCameras(): Promise<number> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'videoinput').length;
  } catch {
    return 0;
  }
}

export const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isInAppBrowser = /Instagram|FBAN|FBAV|Snapchat|TikTok|musical_ly|Line\/|GSA\//i.test(
  navigator.userAgent,
);

export const canScreenShare = !isMobile && !!navigator.mediaDevices?.getDisplayMedia;
