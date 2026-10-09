import { useCallback, useEffect, useState } from 'react';
import { Logo, ShareIcon } from './Icons';
import {
  isIOS,
  isIOSSafari,
  isStandalone,
  type BeforeInstallPromptEvent,
} from '../lib/pwa';
import '../styles/install.css';

export { isIOS, isIOSSafari, isStandalone };
export type { BeforeInstallPromptEvent };

export type InstallBannerProps = {
  className?: string;
  /** Storage key to persist dismissal in localStorage (defaults to 'huddle_pwa_dismissed') */
  storageKey?: string;
  /** Force display mode for testing or storybooks */
  forceShow?: 'native' | 'ios' | boolean;
  /** Callback triggered when the PWA installation is accepted or completed */
  onInstall?: () => void;
  /** Callback triggered when the banner is dismissed */
  onDismiss?: () => void;
};

const DEFAULT_STORAGE_KEY = 'huddle_pwa_dismissed';

/**
 * Smart PWA Install Prompt component.
 *
 * Capabilities:
 * 1. Catches the browser `beforeinstallprompt` event (Android / Desktop Chrome / Edge)
 *    and provides a 1-click "Install App" button.
 * 2. Detects iOS Safari and displays an interactive guidance tooltip:
 *    "Install for best background audio: tap the Share button [icon], then 'Add to Home Screen'".
 * 3. Remembers dismissal state in localStorage ("Don't show again").
 * 4. Automatically hides itself if already running in standalone PWA mode.
 */
export function InstallBanner({
  className = '',
  storageKey = DEFAULT_STORAGE_KEY,
  forceShow = false,
  onInstall,
  onDismiss,
}: InstallBannerProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  });

  const [showIosTooltip, setShowIosTooltip] = useState<boolean>(true);
  const [isInstalling, setIsInstalling] = useState(false);

  // Listen for beforeinstallprompt event (Chromium browsers)
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsDismissed(true);
      try {
        localStorage.setItem(storageKey, 'true');
      } catch {
        // Ignore localStorage errors
      }
      onInstall?.();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [storageKey, onInstall]);

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
    try {
      localStorage.setItem(storageKey, 'true');
    } catch {
      // Ignore localStorage errors
    }
    onDismiss?.();
  }, [storageKey, onDismiss]);

  const handleInstallClick = useCallback(async () => {
    if (!deferredPrompt) return;
    setIsInstalling(true);

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
        setIsDismissed(true);
        try {
          localStorage.setItem(storageKey, 'true');
        } catch {
          // Ignore localStorage errors
        }
        onInstall?.();
      }
    } catch {
      // User cancelled or prompt failed
    } finally {
      setIsInstalling(false);
    }
  }, [deferredPrompt, storageKey, onInstall]);

  // If already running standalone and not forceShow, do not display
  if (!forceShow && isStandalone()) {
    return null;
  }

  // If dismissed and not forced, do not display
  if (!forceShow && isDismissed) {
    return null;
  }

  const isNativePromptAvailable = !!deferredPrompt || forceShow === 'native';
  const isIosDevice = (isIOSSafari() && !deferredPrompt) || forceShow === 'ios';

  // If neither native prompt is available nor iOS Safari detected, nothing to show
  if (!isNativePromptAvailable && !isIosDevice && !forceShow) {
    return null;
  }

  return (
    <aside
      className={`install-banner glass-panel ${className}`}
      aria-label="Install Huddle application"
      role="complementary"
    >
      <div className="install-banner-content">
        <div className="install-banner-icon">
          <Logo size={36} />
        </div>

        <div className="install-banner-text">
          <div className="install-banner-title">
            {isIosDevice ? 'Install for best background audio' : 'Install Huddle App'}
          </div>

          {isIosDevice ? (
            <div className="install-banner-desc">
              <span>Install for best background audio: tap the Share button </span>
              <span className="ios-share-badge" aria-label="Share icon">
                <ShareIcon width={14} height={14} />
              </span>
              <span>, then <strong>&lsquo;Add to Home Screen&rsquo;</strong>.</span>
            </div>
          ) : (
            <div className="install-banner-desc">
              One-click install for instant launch, full-screen video, and reliable background audio.
            </div>
          )}

          {/* Interactive iOS Step-by-Step Instructions */}
          {isIosDevice && showIosTooltip && (
            <div className="ios-instructions-card">
              <div className="ios-step-row">
                <span className="ios-step-num">1</span>
                <span>
                  Tap the Safari <strong>Share</strong> button{' '}
                  <span className="ios-share-badge">
                    <ShareIcon width={13} height={13} />
                  </span>{' '}
                  in the browser toolbar.
                </span>
              </div>
              <div className="ios-step-row">
                <span className="ios-step-num">2</span>
                <span>
                  Scroll down and choose <strong>Add to Home Screen</strong>{' '}
                  <span className="ios-plus-badge">＋</span>.
                </span>
              </div>
              <div className="ios-step-row">
                <span className="ios-step-num">3</span>
                <span>
                  Launch Huddle from your Home Screen for uninterrupted background calls.
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="install-banner-actions">
          {isNativePromptAvailable && (
            <button
              type="button"
              className="install-btn-primary"
              onClick={handleInstallClick}
              disabled={isInstalling}
              aria-label="Install Huddle App"
            >
              {isInstalling ? 'Installing…' : 'Install App'}
            </button>
          )}

          {isIosDevice && (
            <button
              type="button"
              className="install-btn-secondary"
              onClick={() => setShowIosTooltip((prev) => !prev)}
              aria-label={showIosTooltip ? 'Hide installation guide' : 'Show installation guide'}
            >
              {showIosTooltip ? 'Hide Guide' : 'How to Install'}
            </button>
          )}

          <button
            type="button"
            className="install-btn-dismiss"
            onClick={handleDismiss}
            aria-label="Don't show again"
            title="Don't show again"
          >
            Don&rsquo;t show again
          </button>

          <button
            type="button"
            className="install-btn-close"
            onClick={handleDismiss}
            aria-label="Dismiss install banner"
          >
            ✕
          </button>
        </div>
      </div>
    </aside>
  );
}

export default InstallBanner;
