/**
 * PWA and Platform utilities for Huddle.
 */

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

/**
 * Checks whether the application is currently running in standalone / installed PWA mode.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    (typeof document !== 'undefined' && document.referrer.includes('android-app://'))
  );
}

/**
 * Checks whether the current device is running iOS / iPadOS.
 */
export function isIOS(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isApple = /iPad|iPhone|iPod/.test(ua);
  const isIPadOS = navigator.maxTouchPoints > 1 && /Macintosh/.test(ua);
  return isApple || isIPadOS;
}

/**
 * Checks whether the current browser is Mobile Safari on iOS/iPadOS.
 */
export function isIOSSafari(): boolean {
  if (!isIOS()) return false;
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isWebKit = /WebKit/i.test(ua);
  const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|Focus/i.test(ua);
  return isWebKit && !isOtherBrowser;
}
