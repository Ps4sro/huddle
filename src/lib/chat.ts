/**
 * Real-Time Text Chat & Emoji Reactions subsystem for Huddle.
 * Types and helper functions for message management, link parsing,
 * unread count tracking, and reaction events.
 */

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  isLocal: boolean;
}

export interface ReactionEvent {
  id: string;
  senderId: string;
  senderName: string;
  emoji: string;
  xPercent: number; // 0 - 100 representing horizontal screen position percentage
  timestamp: number;
}

/** Standard quick reaction emojis supported across Huddle. */
export const QUICK_EMOJIS = ['❤️', '👍', '😂', '🔥', '🎉', '✋', '👏'] as const;
export type QuickEmoji = (typeof QUICK_EMOJIS)[number];

/**
 * Creates a normalized ChatMessage object.
 */
export function createChatMessage(params: {
  senderId: string;
  senderName: string;
  text: string;
  isLocal?: boolean;
  id?: string;
  timestamp?: number;
}): ChatMessage {
  return {
    id: params.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    senderId: params.senderId,
    senderName: params.senderName.trim() || 'Anonymous',
    text: params.text.trim(),
    timestamp: params.timestamp ?? Date.now(),
    isLocal: params.isLocal ?? false,
  };
}

/**
 * Generates a ReactionEvent with a well-distributed horizontal screen percentage.
 * Keeps xPercent comfortably within 10% - 90% so particles stay visible on all screens.
 */
export function createReactionEvent(params: {
  senderId: string;
  senderName: string;
  emoji: string;
  xPercent?: number;
  id?: string;
  timestamp?: number;
}): ReactionEvent {
  // Generate random xPercent between 15% and 85% by default
  const defaultX = Math.round(15 + Math.random() * 70);
  const clampedX = params.xPercent !== undefined ? Math.max(5, Math.min(95, params.xPercent)) : defaultX;

  return {
    id: params.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
    senderId: params.senderId,
    senderName: params.senderName.trim() || 'Peer',
    emoji: params.emoji,
    xPercent: clampedX,
    timestamp: params.timestamp ?? Date.now(),
  };
}

/**
 * Appends a message to the list, deduplicating by ID and keeping chronological order.
 */
export function addChatMessage(messages: ChatMessage[], newMessage: ChatMessage): ChatMessage[] {
  // If message already exists, replace or ignore
  const index = messages.findIndex((m) => m.id === newMessage.id);
  if (index !== -1) {
    const updated = [...messages];
    updated[index] = newMessage;
    return updated;
  }
  return [...messages, newMessage];
}

/**
 * Computes how many unread messages have arrived since last read timestamp.
 * Local messages sent by the user do not count as unread.
 */
export function computeUnreadCount(
  messages: ChatMessage[],
  lastReadTimestamp: number,
  localUserId?: string,
): number {
  return messages.filter((msg) => {
    if (msg.isLocal) return false;
    if (localUserId && msg.senderId === localUserId) return false;
    return msg.timestamp > lastReadTimestamp;
  }).length;
}

/**
 * Formats a message timestamp into a friendly human-readable time (e.g. "10:45 PM").
 */
export function formatMessageTime(timestamp: number): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
}

/**
 * Token representing a segmented piece of a chat message (plain text or clickable link).
 */
export interface MessageToken {
  type: 'text' | 'link';
  text: string;
  href?: string;
}

/**
 * Regex to detect URLs (http, https, and www.).
 * Excludes trailing punctuation like periods, commas, exclamation points, and closing brackets.
 */
const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
const TRAILING_PUNCTUATION_REGEX = /[.,!?;:)>\]]+$/;

/**
 * Parses message text into plain text and clickable link tokens.
 */
export function parseMessageLinks(text: string): MessageToken[] {
  if (!text) return [];

  const tokens: MessageToken[] = [];
  let lastIndex = 0;

  // Reset regex state
  URL_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = URL_REGEX.exec(text)) !== null) {
    const matchStart = match.index;
    let rawUrl = match[0];

    // Push leading plain text if any
    if (matchStart > lastIndex) {
      tokens.push({
        type: 'text',
        text: text.slice(lastIndex, matchStart),
      });
    }

    // Strip trailing punctuation that belongs to sentence rather than URL
    let trailingPunctuation = '';
    const punctMatch = rawUrl.match(TRAILING_PUNCTUATION_REGEX);
    if (punctMatch) {
      trailingPunctuation = punctMatch[0];
      rawUrl = rawUrl.slice(0, -trailingPunctuation.length);
    }

    // Construct valid href
    const href = rawUrl.startsWith('www.') ? `https://${rawUrl}` : rawUrl;

    tokens.push({
      type: 'link',
      text: rawUrl,
      href,
    });

    if (trailingPunctuation) {
      tokens.push({
        type: 'text',
        text: trailingPunctuation,
      });
    }

    lastIndex = matchStart + match[0].length;
  }

  // Push remaining plain text
  if (lastIndex < text.length) {
    tokens.push({
      type: 'text',
      text: text.slice(lastIndex),
    });
  }

  return tokens;
}
