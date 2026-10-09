import assert from 'node:assert/strict';
import {
  createChatMessage,
  createReactionEvent,
  addChatMessage,
  computeUnreadCount,
  formatMessageTime,
  parseMessageLinks,
  QUICK_EMOJIS,
} from '../src/lib/chat.ts';

console.log('🧪 Testing Chat & Reactions Subsystem...');

// Test 1: Quick Emojis
assert.deepEqual(QUICK_EMOJIS, ['❤️', '👍', '😂', '🔥', '🎉', '✋', '👏']);
console.log('✓ Quick emojis defined correctly');

// Test 2: Message Creation
const msg1 = createChatMessage({
  senderId: 'user-1',
  senderName: 'Alice',
  text: 'Hello world!',
  isLocal: true,
});
assert.equal(msg1.senderId, 'user-1');
assert.equal(msg1.senderName, 'Alice');
assert.equal(msg1.text, 'Hello world!');
assert.equal(msg1.isLocal, true);
assert.ok(msg1.id.length > 0);
assert.ok(typeof msg1.timestamp === 'number');
console.log('✓ Message creation passed');

// Test 3: Deduplication and list management
const msg2 = createChatMessage({
  senderId: 'user-2',
  senderName: 'Bob',
  text: 'Hey Alice!',
  isLocal: false,
});
let list = addChatMessage([], msg1);
list = addChatMessage(list, msg2);
assert.equal(list.length, 2);

// Same id replaces
const msg1Updated = { ...msg1, text: 'Hello updated' };
list = addChatMessage(list, msg1Updated);
assert.equal(list.length, 2);
assert.equal(list[0].text, 'Hello updated');
console.log('✓ Message list deduplication passed');

// Test 4: Unread Count Calculation
const now = Date.now();
const pastMsg = { ...msg2, timestamp: now - 5000 };
const newRemoteMsg = {
  id: 'remote-new',
  senderId: 'user-2',
  senderName: 'Bob',
  text: 'Are you there?',
  timestamp: now + 1000,
  isLocal: false,
};
const newLocalMsg = {
  id: 'local-new',
  senderId: 'user-1',
  senderName: 'Alice',
  text: 'Yes!',
  timestamp: now + 2000,
  isLocal: true,
};

const count = computeUnreadCount([pastMsg, newRemoteMsg, newLocalMsg], now, 'user-1');
assert.equal(count, 1, 'Only remote message newer than read timestamp should be unread');
console.log('✓ Unread count calculation passed');

// Test 5: Timestamp formatting
const timeStr = formatMessageTime(new Date(2026, 9, 8, 22, 15).getTime());
assert.ok(timeStr.includes('10:15') || timeStr.includes('22:15'));
console.log('✓ Timestamp formatting passed');

// Test 6: URL Link Parsing
const sampleText = 'Visit https://github.com and www.google.com! Also see https://huddle.live/room-123.';
const tokens = parseMessageLinks(sampleText);
assert.ok(tokens.length >= 5);
const linkTokens = tokens.filter((t) => t.type === 'link');
assert.equal(linkTokens.length, 3);
assert.equal(linkTokens[0].text, 'https://github.com');
assert.equal(linkTokens[0].href, 'https://github.com');
assert.equal(linkTokens[1].text, 'www.google.com');
assert.equal(linkTokens[1].href, 'https://www.google.com');
assert.equal(linkTokens[2].text, 'https://huddle.live/room-123');
assert.equal(linkTokens[2].href, 'https://huddle.live/room-123');
console.log('✓ URL link parsing passed');

// Test 7: Reaction Creation & distribution
const reaction = createReactionEvent({
  senderId: 'user-2',
  senderName: 'Bob',
  emoji: '🔥',
});
assert.equal(reaction.senderId, 'user-2');
assert.equal(reaction.senderName, 'Bob');
assert.equal(reaction.emoji, '🔥');
assert.ok(reaction.xPercent >= 5 && reaction.xPercent <= 95);
console.log('✓ Reaction event creation passed');

console.log('🎉 ALL CHAT UNIT TESTS PASSED!');
