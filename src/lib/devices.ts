/**
 * Device enumeration, volume meter, audio test chime, and settings storage.
 */

export interface DeviceOption {
  deviceId: string;
  groupId: string;
  kind: MediaDeviceKind;
  label: string;
}

export interface MediaDeviceList {
  audioInputs: DeviceOption[];
  audioOutputs: DeviceOption[];
  videoInputs: DeviceOption[];
}

export interface DeviceSettings {
  selectedAudioInputId: string;
  selectedAudioOutputId: string;
  selectedVideoInputId: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  mirrorSelfView: boolean;
  dataSaverMode: boolean;
}

export const STORAGE_KEYS = {
  AUDIO_INPUT_ID: 'huddle_audio_input_id',
  AUDIO_OUTPUT_ID: 'huddle_audio_output_id',
  VIDEO_INPUT_ID: 'huddle_video_input_id',
  ECHO_CANCELLATION: 'huddle_echo_cancellation',
  NOISE_SUPPRESSION: 'huddle_noise_suppression',
  AUTO_GAIN_CONTROL: 'huddle_auto_gain_control',
  MIRROR_SELF_VIEW: 'huddle_mirror_self_view',
  DATA_SAVER_MODE: 'huddle_data_saver_mode',
} as const;

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  selectedAudioInputId: '',
  selectedAudioOutputId: '',
  selectedVideoInputId: '',
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  mirrorSelfView: true,
  dataSaverMode: false,
};

/**
 * Loads device and media processing settings from localStorage with defaults.
 */
export function loadStoredSettings(): DeviceSettings {
  try {
    const getItemBool = (key: string, defaultVal: boolean): boolean => {
      const val = localStorage.getItem(key);
      if (val === null) return defaultVal;
      return val === 'true';
    };

    return {
      selectedAudioInputId: localStorage.getItem(STORAGE_KEYS.AUDIO_INPUT_ID) || '',
      selectedAudioOutputId: localStorage.getItem(STORAGE_KEYS.AUDIO_OUTPUT_ID) || '',
      selectedVideoInputId: localStorage.getItem(STORAGE_KEYS.VIDEO_INPUT_ID) || '',
      echoCancellation: getItemBool(STORAGE_KEYS.ECHO_CANCELLATION, DEFAULT_DEVICE_SETTINGS.echoCancellation),
      noiseSuppression: getItemBool(STORAGE_KEYS.NOISE_SUPPRESSION, DEFAULT_DEVICE_SETTINGS.noiseSuppression),
      autoGainControl: getItemBool(STORAGE_KEYS.AUTO_GAIN_CONTROL, DEFAULT_DEVICE_SETTINGS.autoGainControl),
      mirrorSelfView: getItemBool(STORAGE_KEYS.MIRROR_SELF_VIEW, DEFAULT_DEVICE_SETTINGS.mirrorSelfView),
      dataSaverMode: getItemBool(STORAGE_KEYS.DATA_SAVER_MODE, DEFAULT_DEVICE_SETTINGS.dataSaverMode),
    };
  } catch {
    return { ...DEFAULT_DEVICE_SETTINGS };
  }
}

/**
 * Persists updated device and media processing settings to localStorage.
 */
export function saveStoredSettings(updates: Partial<DeviceSettings>): void {
  try {
    if (updates.selectedAudioInputId !== undefined) {
      localStorage.setItem(STORAGE_KEYS.AUDIO_INPUT_ID, updates.selectedAudioInputId);
    }
    if (updates.selectedAudioOutputId !== undefined) {
      localStorage.setItem(STORAGE_KEYS.AUDIO_OUTPUT_ID, updates.selectedAudioOutputId);
    }
    if (updates.selectedVideoInputId !== undefined) {
      localStorage.setItem(STORAGE_KEYS.VIDEO_INPUT_ID, updates.selectedVideoInputId);
    }
    if (updates.echoCancellation !== undefined) {
      localStorage.setItem(STORAGE_KEYS.ECHO_CANCELLATION, String(updates.echoCancellation));
    }
    if (updates.noiseSuppression !== undefined) {
      localStorage.setItem(STORAGE_KEYS.NOISE_SUPPRESSION, String(updates.noiseSuppression));
    }
    if (updates.autoGainControl !== undefined) {
      localStorage.setItem(STORAGE_KEYS.AUTO_GAIN_CONTROL, String(updates.autoGainControl));
    }
    if (updates.mirrorSelfView !== undefined) {
      localStorage.setItem(STORAGE_KEYS.MIRROR_SELF_VIEW, String(updates.mirrorSelfView));
    }
    if (updates.dataSaverMode !== undefined) {
      localStorage.setItem(STORAGE_KEYS.DATA_SAVER_MODE, String(updates.dataSaverMode));
    }
  } catch {
    /* localStorage disabled or quota exceeded */
  }
}

/**
 * Enumerate audio inputs (microphones), audio outputs (speakers/headphones),
 * and video inputs (cameras) with friendly fallback labels.
 */
export async function getMediaDevices(): Promise<MediaDeviceList> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return { audioInputs: [], audioOutputs: [], videoInputs: [] };
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();

    let micCount = 0;
    let speakerCount = 0;
    let camCount = 0;

    const audioInputs: DeviceOption[] = [];
    const audioOutputs: DeviceOption[] = [];
    const videoInputs: DeviceOption[] = [];

    for (const d of devices) {
      if (d.kind === 'audioinput') {
        micCount++;
        const label =
          d.label ||
          (d.deviceId === 'default' ? 'Default Microphone' : `Microphone ${micCount}`);
        audioInputs.push({
          deviceId: d.deviceId,
          groupId: d.groupId,
          kind: d.kind,
          label,
        });
      } else if (d.kind === 'audiooutput') {
        speakerCount++;
        const label =
          d.label ||
          (d.deviceId === 'default' ? 'Default Speaker' : `Speaker / Headphones ${speakerCount}`);
        audioOutputs.push({
          deviceId: d.deviceId,
          groupId: d.groupId,
          kind: d.kind,
          label,
        });
      } else if (d.kind === 'videoinput') {
        camCount++;
        const label = d.label || `Camera ${camCount}`;
        videoInputs.push({
          deviceId: d.deviceId,
          groupId: d.groupId,
          kind: d.kind,
          label,
        });
      }
    }

    return { audioInputs, audioOutputs, videoInputs };
  } catch (err) {
    console.warn('[devices] Failed to enumerate devices:', err);
    return { audioInputs: [], audioOutputs: [], videoInputs: [] };
  }
}

/**
 * Listen to media device connection/disconnection events.
 * Returns an unbind cleanup function.
 */
export function onDeviceChange(callback: () => void): () => void {
  if (!navigator.mediaDevices?.addEventListener) {
    return () => {};
  }
  const handler = () => {
    callback();
  };
  navigator.mediaDevices.addEventListener('devicechange', handler);
  return () => {
    navigator.mediaDevices?.removeEventListener('devicechange', handler);
  };
}

/**
 * Checks whether setSinkId is supported on HTMLMediaElement for output routing.
 */
export function supportsAudioOutputSelection(): boolean {
  return (
    typeof HTMLMediaElement !== 'undefined' &&
    'setSinkId' in HTMLMediaElement.prototype
  );
}

/**
 * Plays a pleasant, soft chime tone using Web Audio API AudioContext oscillator
 * to test speaker / headphone output.
 */
export async function testAudioOutput(sinkId?: string): Promise<void> {
  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextClass) return;

  const ctx = new AudioContextClass();
  if (ctx.state === 'suspended') {
    await ctx.resume().catch(() => {});
  }

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.18, ctx.currentTime);

  let audioElement: HTMLAudioElement | null = null;

  if (sinkId && supportsAudioOutputSelection()) {
    try {
      if (typeof (ctx as unknown as { setSinkId?: (id: string) => Promise<void> }).setSinkId === 'function') {
        await (ctx as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(sinkId);
        masterGain.connect(ctx.destination);
      } else {
        const dest = ctx.createMediaStreamDestination();
        masterGain.connect(dest);
        audioElement = new Audio();
        audioElement.srcObject = dest.stream;
        if (typeof (audioElement as unknown as { setSinkId?: (id: string) => Promise<void> }).setSinkId === 'function') {
          await (audioElement as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(sinkId);
        }
        await audioElement.play();
      }
    } catch (err) {
      console.warn('[devices] Failed to route test audio to sinkId, falling back to default:', err);
      masterGain.connect(ctx.destination);
    }
  } else {
    masterGain.connect(ctx.destination);
  }

  // Four-note ascending major chime (C5 -> E5 -> G5 -> C6)
  const notes = [
    { freq: 523.25, time: 0.0, dur: 0.38 },
    { freq: 659.25, time: 0.11, dur: 0.42 },
    { freq: 783.99, time: 0.22, dur: 0.48 },
    { freq: 1046.5, time: 0.33, dur: 0.62 },
  ];

  const now = ctx.currentTime;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const noteGain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(n.freq, now + n.time);

    const start = now + n.time;
    noteGain.gain.setValueAtTime(0.0001, start);
    noteGain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, start + n.dur);

    osc.connect(noteGain);
    noteGain.connect(masterGain);

    osc.start(start);
    osc.stop(start + n.dur + 0.05);
  }

  // Allow the tone to finish playing then tear down
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      try {
        if (audioElement) {
          audioElement.pause();
          audioElement.srcObject = null;
        }
        if (ctx.state !== 'closed') {
          ctx.close().catch(() => {});
        }
      } catch {
        /* ignore */
      }
      resolve();
    }, 1100);
  });
}

/**
 * Real-time volume level meter (0 to 100%) for live mic feedback.
 * Analyzes audio amplitude and computes a smooth responsive volume level.
 * Returns a cleanup function that stops the meter and releases all audio nodes.
 */
export function createMicVolumeMeter(
  track: MediaStreamTrack,
  onVolume: (level: number) => void,
): () => void {
  if (!track || track.readyState === 'ended') {
    onVolume(0);
    return () => {};
  }

  const AudioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextClass) {
    onVolume(0);
    return () => {};
  }

  let ctx: AudioContext | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let animId: number | null = null;
  let active = true;
  let smoothedLevel = 0;

  try {
    ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const stream = new MediaStream([track]);
    sourceNode = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.25;
    sourceNode.connect(analyser); // Do NOT connect to destination to avoid self-playback
  } catch (err) {
    console.warn('[devices] Could not initialize mic volume meter:', err);
    onVolume(0);
    return () => {};
  }

  const dataArray = new Uint8Array(analyser.fftSize);

  const measure = () => {
    if (!active || !analyser) return;

    if (!track.enabled || track.readyState !== 'live') {
      smoothedLevel = 0;
      onVolume(0);
    } else {
      analyser.getByteTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / dataArray.length);

      // RMS in normal speech is typically 0.01 to 0.25.
      // Boost curve with scaling for responsive 0-100 gauge
      const targetPercent = Math.min(100, Math.max(0, rms * 280));

      if (targetPercent > smoothedLevel) {
        // Snappy attack
        smoothedLevel = smoothedLevel * 0.25 + targetPercent * 0.75;
      } else {
        // Natural exponential decay
        smoothedLevel = smoothedLevel * 0.82 + targetPercent * 0.18;
      }

      const displayLevel = smoothedLevel < 1.5 ? 0 : Math.round(smoothedLevel);
      onVolume(displayLevel);
    }

    animId = requestAnimationFrame(measure);
  };

  animId = requestAnimationFrame(measure);

  const handleEnded = () => {
    cleanup();
  };
  track.addEventListener('ended', handleEnded);

  let isCleanedUp = false;
  const cleanup = () => {
    if (isCleanedUp) return;
    isCleanedUp = true;
    active = false;
    track.removeEventListener('ended', handleEnded);
    if (animId !== null) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    try {
      sourceNode?.disconnect();
      analyser?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      if (ctx && ctx.state !== 'closed') {
        ctx.close().catch(() => {});
      }
    } catch {
      /* ignore */
    }
    onVolume(0);
  };

  return cleanup;
}

/**
 * Builds MediaTrackConstraints for audio input incorporating user preferences.
 */
export function getAudioConstraints(
  deviceId?: string,
  settings?: Partial<DeviceSettings>,
): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = {
    echoCancellation: settings?.echoCancellation ?? true,
    noiseSuppression: settings?.noiseSuppression ?? true,
    autoGainControl: settings?.autoGainControl ?? true,
  };
  if (deviceId && deviceId !== 'default') {
    constraints.deviceId = { exact: deviceId };
  }
  return constraints;
}

/**
 * Builds MediaTrackConstraints for video input incorporating device selection
 * and bandwidth saver preferences.
 */
export function getVideoConstraints(
  deviceId?: string,
  dataSaver = false,
): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = dataSaver
    ? {
        width: { ideal: 640, max: 640 },
        height: { ideal: 360, max: 360 },
        frameRate: { ideal: 20, max: 24 },
      }
    : {
        width: { ideal: 960 },
        height: { ideal: 540 },
        frameRate: { ideal: 24, max: 30 },
      };

  if (deviceId && deviceId !== 'default') {
    constraints.deviceId = { exact: deviceId };
  }
  return constraints;
}
