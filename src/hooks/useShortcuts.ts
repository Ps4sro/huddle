import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Definition for an individual keyboard shortcut displayed in the cheat sheet.
 */
export type ShortcutItem = {
  id: string;
  key: string;
  displayKeys: string[];
  description: string;
  category: 'Audio & Video' | 'Controls' | 'General';
};

/**
 * Master list of desktop keyboard shortcuts for Huddle.
 */
export const HUDDLE_SHORTCUTS: ShortcutItem[] = [
  {
    id: 'push-to-talk',
    key: 'Space',
    displayKeys: ['Space'],
    description: 'Push-to-talk (hold to unmute, release to mute)',
    category: 'Audio & Video',
  },
  {
    id: 'toggle-mic',
    key: 'm',
    displayKeys: ['M'],
    description: 'Toggle microphone on / off',
    category: 'Audio & Video',
  },
  {
    id: 'toggle-cam',
    key: 'v',
    displayKeys: ['V'],
    description: 'Toggle camera on / off',
    category: 'Audio & Video',
  },
  {
    id: 'toggle-screen',
    key: 's',
    displayKeys: ['S'],
    description: 'Toggle screen share',
    category: 'Controls',
  },
  {
    id: 'toggle-chat',
    key: 'c',
    displayKeys: ['C'],
    description: 'Toggle in-call chat',
    category: 'Controls',
  },
  {
    id: 'show-shortcuts',
    key: '?',
    displayKeys: ['?'],
    description: 'Open keyboard shortcuts cheat sheet',
    category: 'General',
  },
];

export type UseShortcutsOptions = {
  /** Callback when 'm' or 'M' is pressed */
  onToggleMic?: () => void;
  /** Callback when 'v' or 'V' is pressed */
  onToggleCam?: () => void;
  /** Callback when 'c' or 'C' is pressed */
  onToggleChat?: () => void;
  /** Callback when 's' or 'S' is pressed */
  onToggleScreenShare?: () => void;
  /** Callback when '?' is pressed */
  onOpenShortcuts?: () => void;
  /** Callback when shortcuts modal should close */
  onCloseShortcuts?: () => void;
  /** Direct callback when Space is pressed down */
  onPushToTalkStart?: () => void;
  /** Direct callback when Space is released */
  onPushToTalkEnd?: () => void;
  /**
   * Optional direct setter for audio state, automatically invoked
   * during push-to-talk if onPushToTalkStart/End are not provided.
   */
  setAudioEnabled?: (enabled: boolean) => void | Promise<void>;
  /** Current microphone state (used to determine push-to-talk behavior) */
  isAudioEnabled?: boolean;
  /** Master switch to enable or disable keyboard listeners (default: true) */
  enabled?: boolean;
};

export type UseShortcutsReturn = {
  /** Whether the user is currently holding Space for push-to-talk */
  isPushingToTalk: boolean;
  /** Whether the shortcuts cheat sheet modal is currently visible */
  isShortcutsOpen: boolean;
  /** Programmatically open the shortcuts modal */
  openShortcuts: () => void;
  /** Programmatically close the shortcuts modal */
  closeShortcuts: () => void;
  /** Toggle the shortcuts modal */
  toggleShortcuts: () => void;
};

/**
 * Checks whether an event originated from a text input or editable element.
 */
export function isTypingElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  if (target.isContentEditable) {
    return true;
  }

  if (target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')) {
    return true;
  }

  return false;
}

/**
 * Keyboard shortcuts hook for desktop power users.
 *
 * Supported keys:
 * - Space: Push-to-talk (hold to unmute, release to mute)
 * - m / M: Toggle microphone
 * - v / V: Toggle camera
 * - c / C: Toggle in-call chat
 * - s / S: Toggle screen share
 * - ?: Open keyboard shortcuts cheat sheet
 * - Escape: Close shortcuts cheat sheet
 *
 * Automatically ignores shortcuts when focus is inside an `<input>`, `<textarea>`,
 * or contentEditable element, or when modifier keys (Cmd, Ctrl, Alt) are active.
 */
export function useShortcuts(options: UseShortcutsOptions = {}): UseShortcutsReturn {
  const { enabled = true } = options;

  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isPushingToTalk, setIsPushingToTalk] = useState(false);

  // Store options in a ref so the event listener doesn't need to be recreated on every state update
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const isPushingRef = useRef(false);
  const wasMutedBeforePushRef = useRef(false);

  const openShortcuts = useCallback(() => {
    setIsShortcutsOpen(true);
    optionsRef.current.onOpenShortcuts?.();
  }, []);

  const closeShortcuts = useCallback(() => {
    setIsShortcutsOpen(false);
    optionsRef.current.onCloseShortcuts?.();
  }, []);

  const toggleShortcuts = useCallback(() => {
    setIsShortcutsOpen((prev) => {
      const next = !prev;
      if (next) {
        optionsRef.current.onOpenShortcuts?.();
      } else {
        optionsRef.current.onCloseShortcuts?.();
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if focus is in an input or editable field
      if (isTypingElement(e.target)) return;

      // Handle Escape to close shortcuts modal if open
      if (e.key === 'Escape') {
        if (isShortcutsOpen) {
          e.preventDefault();
          closeShortcuts();
          return;
        }
      }

      // Space — Push-to-talk
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (e.repeat) return; // Prevent repeated triggers while held

        if (!isPushingRef.current) {
          isPushingRef.current = true;
          setIsPushingToTalk(true);

          const opts = optionsRef.current;
          wasMutedBeforePushRef.current = opts.isAudioEnabled === false;

          if (opts.onPushToTalkStart) {
            opts.onPushToTalkStart();
          } else if (opts.setAudioEnabled) {
            void opts.setAudioEnabled(true);
          } else if (opts.isAudioEnabled === false && opts.onToggleMic) {
            opts.onToggleMic();
          }
        }
        return;
      }

      // Modifier key guard: do NOT trigger letter shortcuts on Ctrl+C, Cmd+V, Alt+S, etc.
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      // Shortcut cheat sheet: '?'
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault();
        toggleShortcuts();
        return;
      }

      // Single-character commands (case-insensitive)
      const key = e.key.toLowerCase();
      switch (key) {
        case 'm': {
          e.preventDefault();
          optionsRef.current.onToggleMic?.();
          break;
        }
        case 'v': {
          e.preventDefault();
          optionsRef.current.onToggleCam?.();
          break;
        }
        case 'c': {
          e.preventDefault();
          optionsRef.current.onToggleChat?.();
          break;
        }
        case 's': {
          e.preventDefault();
          optionsRef.current.onToggleScreenShare?.();
          break;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Ignore if typing
      if (isTypingElement(e.target)) return;

      // Space — Push-to-talk release
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (isPushingRef.current) {
          isPushingRef.current = false;
          setIsPushingToTalk(false);

          const opts = optionsRef.current;
          if (opts.onPushToTalkEnd) {
            opts.onPushToTalkEnd();
          } else if (opts.setAudioEnabled) {
            void opts.setAudioEnabled(false);
          } else if (wasMutedBeforePushRef.current && opts.onToggleMic) {
            opts.onToggleMic();
          }
        }
      }
    };

    // If window blurs while Space is held, cleanly release push-to-talk
    const handleBlur = () => {
      if (isPushingRef.current) {
        isPushingRef.current = false;
        setIsPushingToTalk(false);

        const opts = optionsRef.current;
        if (opts.onPushToTalkEnd) {
          opts.onPushToTalkEnd();
        } else if (opts.setAudioEnabled) {
          void opts.setAudioEnabled(false);
        } else if (wasMutedBeforePushRef.current && opts.onToggleMic) {
          opts.onToggleMic();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [enabled, isShortcutsOpen, closeShortcuts, toggleShortcuts]);

  return {
    isPushingToTalk,
    isShortcutsOpen,
    openShortcuts,
    closeShortcuts,
    toggleShortcuts,
  };
}
