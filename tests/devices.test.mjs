import assert from 'node:assert';
import { test } from 'node:test';

// Mock Web Audio & Navigator APIs for Node environment testing
class MockAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = {};
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
  createGain() {
    return {
      gain: {
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      connect: () => {},
      disconnect: () => {},
    };
  }
  createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime: () => {} },
      connect: () => {},
      start: () => {},
      stop: () => {},
    };
  }
  createMediaStreamSource() {
    return {
      connect: () => {},
      disconnect: () => {},
    };
  }
  createAnalyser() {
    return {
      fftSize: 512,
      smoothingTimeConstant: 0.25,
      getByteTimeDomainData: (arr) => {
        // simulate some voice wave
        for (let i = 0; i < arr.length; i++) {
          arr[i] = 128 + Math.floor(Math.sin(i / 10) * 40);
        }
      },
      connect: () => {},
      disconnect: () => {},
    };
  }
}

globalThis.window = globalThis;
globalThis.AudioContext = MockAudioContext;
globalThis.MediaStream = class MockMediaStream {
  constructor(tracks = []) {
    this.tracks = tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video');
  }
};
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

// In-memory mock localStorage
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

// Mock navigator.mediaDevices
const listeners = new Map();
const mockNavigator = {
  mediaDevices: {
    async enumerateDevices() {
      return [
        { deviceId: 'mic-1', groupId: 'g1', kind: 'audioinput', label: 'USB Mic' },
        { deviceId: 'mic-2', groupId: 'g2', kind: 'audioinput', label: '' },
        { deviceId: 'spk-1', groupId: 'g3', kind: 'audiooutput', label: 'Headphones' },
        { deviceId: 'cam-1', groupId: 'g4', kind: 'videoinput', label: 'Webcam HD' },
      ];
    },
    addEventListener(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
    },
    removeEventListener(event, fn) {
      listeners.get(event)?.delete(fn);
    },
  },
};
Object.defineProperty(globalThis, 'navigator', {
  value: mockNavigator,
  configurable: true,
  writable: true,
});

// Import compiled devices module from dist or via tsx/node
import {
  getMediaDevices,
  onDeviceChange,
  supportsAudioOutputSelection,
  testAudioOutput,
  createMicVolumeMeter,
  loadStoredSettings,
  saveStoredSettings,
  getAudioConstraints,
  getVideoConstraints,
  DEFAULT_DEVICE_SETTINGS,
} from '../src/lib/devices.ts';

test('getMediaDevices enumerates audio inputs, outputs, and cameras with friendly labels', async () => {
  const result = await getMediaDevices();
  assert.strictEqual(result.audioInputs.length, 2);
  assert.strictEqual(result.audioInputs[0].label, 'USB Mic');
  assert.strictEqual(result.audioInputs[1].label, 'Microphone 2'); // Fallback label
  assert.strictEqual(result.audioOutputs.length, 1);
  assert.strictEqual(result.audioOutputs[0].label, 'Headphones');
  assert.strictEqual(result.videoInputs.length, 1);
  assert.strictEqual(result.videoInputs[0].label, 'Webcam HD');
});

test('onDeviceChange binds and cleans up devicechange listeners', () => {
  let fired = 0;
  const cleanup = onDeviceChange(() => {
    fired++;
  });

  const fns = listeners.get('devicechange');
  assert.ok(fns && fns.size > 0);
  for (const fn of fns) fn();
  assert.strictEqual(fired, 1);

  cleanup();
  assert.strictEqual(fns.size, 0);
});

test('supportsAudioOutputSelection checks HTMLMediaElement prototype setSinkId', () => {
  // Currently HTMLMediaElement is not defined in standard node, so false
  assert.strictEqual(supportsAudioOutputSelection(), false);

  // When simulated:
  globalThis.HTMLMediaElement = class MockHTMLMediaElement {};
  globalThis.HTMLMediaElement.prototype.setSinkId = async () => {};
  assert.strictEqual(supportsAudioOutputSelection(), true);
  delete globalThis.HTMLMediaElement;
});

test('loadStoredSettings and saveStoredSettings persists user preferences', () => {
  store.clear();
  const initial = loadStoredSettings();
  assert.strictEqual(initial.echoCancellation, DEFAULT_DEVICE_SETTINGS.echoCancellation);
  assert.strictEqual(initial.dataSaverMode, false);

  saveStoredSettings({
    selectedAudioInputId: 'custom-mic',
    echoCancellation: false,
    dataSaverMode: true,
  });

  const updated = loadStoredSettings();
  assert.strictEqual(updated.selectedAudioInputId, 'custom-mic');
  assert.strictEqual(updated.echoCancellation, false);
  assert.strictEqual(updated.dataSaverMode, true);
});

test('getAudioConstraints and getVideoConstraints produce valid constraints', () => {
  const audioConstraints = getAudioConstraints('my-mic', { echoCancellation: false });
  assert.deepStrictEqual(audioConstraints.deviceId, { exact: 'my-mic' });
  assert.strictEqual(audioConstraints.echoCancellation, false);

  const videoConstraintsSaver = getVideoConstraints('cam-1', true);
  assert.deepStrictEqual(videoConstraintsSaver.deviceId, { exact: 'cam-1' });
  assert.deepStrictEqual(videoConstraintsSaver.width, { ideal: 640, max: 640 });

  const videoConstraintsNormal = getVideoConstraints(undefined, false);
  assert.strictEqual(videoConstraintsNormal.deviceId, undefined);
  assert.deepStrictEqual(videoConstraintsNormal.width, { ideal: 960 });
});

test('createMicVolumeMeter generates volume feedback and cleans up', async () => {
  const endedListeners = new Set();
  const mockTrack = {
    kind: 'audio',
    enabled: true,
    readyState: 'live',
    addEventListener(ev, fn) {
      if (ev === 'ended') endedListeners.add(fn);
    },
    removeEventListener(ev, fn) {
      if (ev === 'ended') endedListeners.delete(fn);
    },
  };

  let lastVolume = -1;
  const stopMeter = createMicVolumeMeter(mockTrack, (vol) => {
    lastVolume = vol;
  });

  // Wait for RAF cycle
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(lastVolume >= 0, `Volume should be non-negative, got ${lastVolume}`);

  stopMeter();
  assert.strictEqual(lastVolume, 0);
});

test('testAudioOutput executes tone chime without errors', async () => {
  await testAudioOutput();
  assert.ok(true, 'Tone played successfully');
});
