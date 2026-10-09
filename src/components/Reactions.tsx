import { useCallback, useEffect, useState } from 'react';
import type { ReactionEvent } from '../lib/chat';
import { QUICK_EMOJIS } from '../lib/chat';
import '../styles/chat.css';

/* ---------------- SVG ICONS ---------------- */
export function SmileIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="2.5" />
      <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="2.5" />
    </svg>
  );
}

/* ---------------- QUICK REACTION BAR ---------------- */
export interface QuickReactionsBarProps {
  /** Callback fired when user selects an emoji */
  onSelectEmoji: (emoji: string) => void;
  /** Optional custom list of emojis; defaults to quick emojis */
  emojis?: readonly string[];
  /** Whether the reaction bar is visible (when floating above controls) */
  isOpen?: boolean;
  /** Optional close callback */
  onClose?: () => void;
  /** Whether the bar is docked permanently or floating */
  docked?: boolean;
  /** Extra class names */
  className?: string;
}

export function QuickReactionsBar({
  onSelectEmoji,
  emojis = QUICK_EMOJIS,
  isOpen = true,
  docked = false,
  className = '',
}: QuickReactionsBarProps) {
  if (!isOpen) return null;

  return (
    <div
      className={`quick-reactions-bar ${docked ? 'docked' : 'floating'} ${className}`}
      role="toolbar"
      aria-label="Quick reactions"
    >
      {emojis.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="reaction-btn"
          onClick={() => onSelectEmoji(emoji)}
          aria-label={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

/* ---------------- FLOATING PARTICLES OVERLAY ---------------- */
export interface FloatingReactionsOverlayProps {
  /** Current active reactions to display */
  reactions: ReactionEvent[];
  /** Callback to prune expired reactions */
  onReactionComplete?: (id: string) => void;
  /** Optional custom CSS class */
  className?: string;
}

export function FloatingReactionsOverlay({
  reactions,
  onReactionComplete,
  className = '',
}: FloatingReactionsOverlayProps) {
  // Prune reaction safety cleanup timer (after ~2.6s) in case tab is throttled or animationend is delayed
  useEffect(() => {
    if (!onReactionComplete || reactions.length === 0) return;

    const now = Date.now();
    const timers = reactions.map((r) => {
      const elapsed = now - r.timestamp;
      const remaining = Math.max(0, 2600 - elapsed);
      return setTimeout(() => {
        onReactionComplete(r.id);
      }, remaining);
    });

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [reactions, onReactionComplete]);

  if (reactions.length === 0) return null;

  return (
    <div
      className={`reactions-overlay ${className}`}
      aria-live="polite"
      aria-atomic="true"
    >
      {reactions.map((r) => (
        <div
          key={r.id}
          className="reaction-particle"
          style={{ left: `${r.xPercent}%` }}
          onAnimationEnd={() => onReactionComplete?.(r.id)}
        >
          <span className="reaction-emoji" role="img" aria-label={r.emoji}>
            {r.emoji}
          </span>
          {r.senderName && (
            <span className="reaction-sender">{r.senderName}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- REACTION TRIGGER BUTTON ---------------- */
export interface ReactionTriggerButtonProps {
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
}

export function ReactionTriggerButton({
  isOpen,
  onToggle,
  className = '',
}: ReactionTriggerButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`ctrl-btn ${isOpen ? 'highlight' : ''} ${className}`}
      data-tip={isOpen ? 'Close Reactions' : 'Reactions'}
      aria-label={isOpen ? 'Close reaction bar' : 'Open reaction bar'}
    >
      <SmileIcon size={22} />
    </button>
  );
}

/* ---------------- CUSTOM HOOK ---------------- */
export function useFloatingReactions() {
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);

  const addReaction = useCallback((reaction: ReactionEvent) => {
    setReactions((prev) => [...prev, reaction]);
  }, []);

  const removeReaction = useCallback((id: string) => {
    setReactions((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const clearReactions = useCallback(() => {
    setReactions([]);
  }, []);

  return {
    reactions,
    addReaction,
    removeReaction,
    clearReactions,
  };
}

/* ---------------- COMPOSITE COMPONENT ---------------- */
export interface ReactionsProps {
  reactions: ReactionEvent[];
  onReactionComplete?: (id: string) => void;
  onSelectEmoji: (emoji: string) => void;
  isBarOpen?: boolean;
  docked?: boolean;
  emojis?: readonly string[];
}

export function Reactions({
  reactions,
  onReactionComplete,
  onSelectEmoji,
  isBarOpen = false,
  docked = false,
  emojis,
}: ReactionsProps) {
  return (
    <>
      <FloatingReactionsOverlay
        reactions={reactions}
        onReactionComplete={onReactionComplete}
      />
      <QuickReactionsBar
        isOpen={isBarOpen}
        docked={docked}
        onSelectEmoji={onSelectEmoji}
        emojis={emojis}
      />
    </>
  );
}
