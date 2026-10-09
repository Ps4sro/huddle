import assert from 'node:assert/strict';

console.log('🧪 Testing PWA, Share, and Shortcuts Subsystems...');

function setNavigator(val) {
  Object.defineProperty(globalThis, 'navigator', {
    value: val,
    configurable: true,
    writable: true,
  });
}

function setWindow(val) {
  Object.defineProperty(globalThis, 'window', {
    value: val,
    configurable: true,
    writable: true,
  });
}

function setDocument(val) {
  Object.defineProperty(globalThis, 'document', {
    value: val,
    configurable: true,
    writable: true,
  });
}

// --- Test 1: shareRoom logic ---
console.log('Testing shareRoom behavior...');
{
  // Case 1A: navigator.share succeeds
  let shareCalled = false;
  setNavigator({
    share: async (data) => {
      shareCalled = true;
      assert.equal(data.url, 'https://huddle.test/r/room-1');
    },
    canShare: () => true,
    clipboard: {
      writeText: async () => assert.fail('Should not call clipboard when share succeeds'),
    },
  });

  const { shareRoom } = await import('../src/lib/share.ts');

  const res1 = await shareRoom('room-1', 'https://huddle.test/r/room-1');
  assert.equal(shareCalled, true);
  assert.deepEqual(res1, { shared: true, copied: false });
  console.log('  ✓ Native share success: returns { shared: true, copied: false }');

  // Case 1B: User aborts share sheet (AbortError)
  const abortErr = new Error('Share canceled');
  abortErr.name = 'AbortError';
  setNavigator({
    share: async () => {
      throw abortErr;
    },
    canShare: () => true,
    clipboard: {
      writeText: async () => assert.fail('Should not fallback to clipboard on AbortError'),
    },
  });

  // Ensure DOMException or AbortError match
  globalThis.DOMException = class DOMException extends Error {};
  abortErr.constructor = globalThis.DOMException;
  Object.setPrototypeOf(abortErr, globalThis.DOMException.prototype);

  const res2 = await shareRoom('room-1', 'https://huddle.test/r/room-1');
  assert.deepEqual(res2, { shared: false, copied: false });
  console.log('  ✓ User cancels native share: returns { shared: false, copied: false }');

  // Case 1C: navigator.share throws other error -> falls back to clipboard
  let clipboardCalled = false;
  setNavigator({
    share: async () => {
      throw new Error('Share failed unexpectedly');
    },
    canShare: () => true,
    clipboard: {
      writeText: async (text) => {
        clipboardCalled = true;
        assert.equal(text, 'https://huddle.test/r/room-1');
      },
    },
  });

  const res3 = await shareRoom('room-1', 'https://huddle.test/r/room-1');
  assert.equal(clipboardCalled, true);
  assert.deepEqual(res3, { shared: false, copied: true });
  console.log('  ✓ Share failure fallback to clipboard: returns { shared: false, copied: true }');

  // Case 1D: navigator.share absent -> direct clipboard
  let directClipCalled = false;
  setNavigator({
    clipboard: {
      writeText: async (text) => {
        directClipCalled = true;
        assert.equal(text, 'https://huddle.test/r/room-1');
      },
    },
  });

  const res4 = await shareRoom('room-1', 'https://huddle.test/r/room-1');
  assert.equal(directClipCalled, true);
  assert.deepEqual(res4, { shared: false, copied: true });
  console.log('  ✓ Desktop / no share sheet: returns { shared: false, copied: true }');
}

// --- Test 2: useShortcuts & isTypingElement logic ---
console.log('Testing useShortcuts & isTypingElement...');
{
  const { isTypingElement, HUDDLE_SHORTCUTS } = await import('../src/hooks/useShortcuts.ts');

  assert.ok(Array.isArray(HUDDLE_SHORTCUTS));
  assert.ok(HUDDLE_SHORTCUTS.some((s) => s.key === 'Space'));
  assert.ok(HUDDLE_SHORTCUTS.some((s) => s.key === 'm'));
  assert.ok(HUDDLE_SHORTCUTS.some((s) => s.key === 'v'));
  assert.ok(HUDDLE_SHORTCUTS.some((s) => s.key === 'c'));
  assert.ok(HUDDLE_SHORTCUTS.some((s) => s.key === 's'));
  assert.ok(HUDDLE_SHORTCUTS.some((s) => s.key === '?'));
  console.log('  ✓ HUDDLE_SHORTCUTS exports all required shortcuts (Space, M, V, C, S, ?)');

  // Mock DOM elements to test isTypingElement
  class MockElement {
    constructor(tagName, isContentEditable = false, closestMatch = null) {
      this.tagName = tagName;
      this.isContentEditable = isContentEditable;
      this._closest = closestMatch;
    }
    closest() {
      return this._closest;
    }
  }

  globalThis.HTMLElement = MockElement;

  const inputEl = new MockElement('INPUT');
  const textareaEl = new MockElement('TEXTAREA');
  const divEl = new MockElement('DIV');
  const editableDiv = new MockElement('DIV', true);
  const childOfInput = new MockElement('SPAN', false, inputEl);

  assert.equal(isTypingElement(inputEl), true);
  assert.equal(isTypingElement(textareaEl), true);
  assert.equal(isTypingElement(editableDiv), true);
  assert.equal(isTypingElement(childOfInput), true);
  assert.equal(isTypingElement(divEl), false);
  assert.equal(isTypingElement(null), false);
  console.log('  ✓ isTypingElement correctly identifies inputs, textareas, and contentEditable elements');
}

// --- Test 3: InstallBanner platform detection ---
console.log('Testing InstallBanner platform detection...');
{
  // Test platform utilities from pwa.ts
  const { isStandalone, isIOS, isIOSSafari } = await import('../src/lib/pwa.ts');

  // Case 3A: Desktop Chrome
  setWindow({
    matchMedia: () => ({ matches: false }),
    navigator: {},
  });
  setNavigator({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    maxTouchPoints: 0,
  });
  setDocument({ referrer: '' });

  assert.equal(isStandalone(), false);
  assert.equal(isIOS(), false);
  assert.equal(isIOSSafari(), false);
  console.log('  ✓ Desktop Chrome correctly identified (not iOS, not standalone)');

  // Case 3B: iOS Safari
  setNavigator({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    maxTouchPoints: 5,
  });
  assert.equal(isIOS(), true);
  assert.equal(isIOSSafari(), true);
  console.log('  ✓ iOS Safari correctly identified');

  // Case 3C: iOS Chrome (CriOS)
  setNavigator({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1',
    maxTouchPoints: 5,
  });
  assert.equal(isIOS(), true);
  assert.equal(isIOSSafari(), false);
  console.log('  ✓ iOS Chrome (CriOS) recognized as iOS but not iOS Safari');

  // Case 3D: Standalone PWA mode
  setWindow({
    matchMedia: (query) => ({
      matches: query.includes('display-mode: standalone'),
    }),
    navigator: {},
  });
  assert.equal(isStandalone(), true);
  console.log('  ✓ Standalone PWA display mode correctly detected');
}

console.log('\n🎉 ALL SUBSYSTEM TESTS PASSED SUCCESSFULLY!');
