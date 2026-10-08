const ADJECTIVES = [
  'brave', 'calm', 'cozy', 'crisp', 'eager', 'fuzzy', 'happy', 'jolly', 'lucky', 'mellow',
  'mighty', 'neon', 'nimble', 'proud', 'quick', 'shiny', 'sunny', 'swift', 'witty', 'zesty',
];
const NOUNS = [
  'otter', 'panda', 'falcon', 'koala', 'tiger', 'lemur', 'moose', 'gecko', 'raven', 'whale',
  'bison', 'fox', 'heron', 'lynx', 'yak', 'orca', 'puffin', 'mango', 'comet', 'pixel',
];

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export function generateRoomId(): string {
  const n = Math.floor(100 + Math.random() * 900);
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${n}`;
}

export const ROOM_RE = /^[a-z0-9-]{3,64}$/;

/** Accepts a bare code ("brave-otter-123") or a full invite link. */
export function parseRoomInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\/r\/([^/?#\s]+)/);
  const candidate = (match ? match[1] : trimmed).toLowerCase().replace(/\s+/g, '-');
  return ROOM_RE.test(candidate) ? candidate : null;
}

export function roomUrl(roomId: string): string {
  return `${location.origin}/r/${roomId}`;
}
