import React, { useEffect, useRef, useState } from 'react';
import '../styles/settings.css';
import {
  createMicVolumeMeter,
  getAudioConstraints,
  getMediaDevices,
  getVideoConstraints,
  loadStoredSettings,
  onDeviceChange,
  saveStoredSettings,
  supportsAudioOutputSelection,
  testAudioOutput,
  type DeviceOption,
  type DeviceSettings,
  type MediaDeviceList,
} from '../lib/devices';
import { CamIcon, MicIcon, VolumeIcon } from './Icons';

export type SettingsTab = 'audio' | 'video' | 'general';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Current live audio track from call/lobby (optional) */
  currentAudioTrack?: MediaStreamTrack | null;
  /** Current live video track from call/lobby (optional) */
  currentVideoTrack?: MediaStreamTrack | null;
  /** Callback when user picks a different mic device */
  onMicChange?: (deviceId: string) => void | Promise<void>;
  /** Callback when user picks a different speaker device */
  onSpeakerChange?: (deviceId: string) => void | Promise<void>;
  /** Callback when user picks a different camera device */
  onCameraChange?: (deviceId: string) => void | Promise<void>;
  /** Audio processing options */
  echoCancellation?: boolean;
  onEchoCancellationChange?: (enabled: boolean) => void;
  noiseSuppression?: boolean;
  onNoiseSuppressionChange?: (enabled: boolean) => void;
  autoGainControl?: boolean;
  onAutoGainControlChange?: (enabled: boolean) => void;
  /** Video options */
  mirrorSelfView?: boolean;
  onMirrorSelfViewChange?: (enabled: boolean) => void;
  /** General options */
  dataSaverMode?: boolean;
  onDataSaverChange?: (enabled: boolean) => void;
  /** Initial active tab */
  initialTab?: SettingsTab;
}

// Minimal inline SVG icons for UI accents
const SlidersIcon = ({ size = 20 }: { size?: number }) => (
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
    <line x1="4" y1="21" x2="4" y2="14" />
    <line x1="4" y1="10" x2="4" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12" y2="3" />
    <line x1="20" y1="21" x2="20" y2="16" />
    <line x1="20" y1="12" x2="20" y2="3" />
    <line x1="1" y1="14" x2="7" y2="14" />
    <line x1="9" y1="8" x2="15" y2="8" />
    <line x1="17" y1="16" x2="23" y2="16" />
  </svg>
);

const CloseIcon = ({ size = 18 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ChevronDownIcon = ({ size = 16 }: { size?: number }) => (
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
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const InfoIcon = ({ size = 18 }: { size?: number }) => (
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
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

export function SettingsModal({
  isOpen,
  onClose,
  currentAudioTrack,
  currentVideoTrack,
  onMicChange,
  onSpeakerChange,
  onCameraChange,
  echoCancellation: propEcho,
  onEchoCancellationChange,
  noiseSuppression: propNoise,
  onNoiseSuppressionChange,
  autoGainControl: propAgc,
  onAutoGainControlChange,
  mirrorSelfView: propMirror,
  onMirrorSelfViewChange,
  dataSaverMode: propDataSaver,
  onDataSaverChange,
  initialTab = 'audio',
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [devices, setDevices] = useState<MediaDeviceList>({
    audioInputs: [],
    audioOutputs: [],
    videoInputs: [],
  });

  // Stored preferences
  const [settings, setSettings] = useState<DeviceSettings>(() => loadStoredSettings());

  // Selected device IDs
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>('');
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  // Audio processing toggles
  const [echoCancellation, setEchoCancellation] = useState<boolean>(
    () => propEcho ?? settings.echoCancellation,
  );
  const [noiseSuppression, setNoiseSuppression] = useState<boolean>(
    () => propNoise ?? settings.noiseSuppression,
  );
  const [autoGainControl, setAutoGainControl] = useState<boolean>(
    () => propAgc ?? settings.autoGainControl,
  );

  // Video toggles
  const [mirrorSelfView, setMirrorSelfView] = useState<boolean>(
    () => propMirror ?? settings.mirrorSelfView,
  );

  // General toggles
  const [dataSaverMode, setDataSaverMode] = useState<boolean>(
    () => propDataSaver ?? settings.dataSaverMode,
  );

  // Live mic meter level (0 - 100)
  const [volumeLevel, setVolumeLevel] = useState<number>(0);
  const [isTestingSpeaker, setIsTestingSpeaker] = useState<boolean>(false);

  // Local tracks created specifically for preview inside modal when needed
  const [previewAudioTrack, setPreviewAudioTrack] = useState<MediaStreamTrack | null>(null);
  const [previewVideoTrack, setPreviewVideoTrack] = useState<MediaStreamTrack | null>(null);

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const audioOutputSupported = supportsAudioOutputSelection();

  // Reset tab on modal re-open
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setSettings(loadStoredSettings());
    }
  }, [isOpen, initialTab]);

  // Sync prop changes into state
  useEffect(() => {
    if (propEcho !== undefined) setEchoCancellation(propEcho);
  }, [propEcho]);
  useEffect(() => {
    if (propNoise !== undefined) setNoiseSuppression(propNoise);
  }, [propNoise]);
  useEffect(() => {
    if (propAgc !== undefined) setAutoGainControl(propAgc);
  }, [propAgc]);
  useEffect(() => {
    if (propMirror !== undefined) setMirrorSelfView(propMirror);
  }, [propMirror]);
  useEffect(() => {
    if (propDataSaver !== undefined) setDataSaverMode(propDataSaver);
  }, [propDataSaver]);

  // Enumerate devices on open and listen to devicechange
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    const fetchDevices = async () => {
      const devList = await getMediaDevices();
      if (!mounted) return;
      setDevices(devList);

      // Determine active microphone
      const activeMicId =
        (currentAudioTrack?.getSettings()?.deviceId as string | undefined) ||
        settings.selectedAudioInputId ||
        devList.audioInputs[0]?.deviceId ||
        'default';
      setSelectedMicId(activeMicId);

      // Determine active speaker
      const activeSpeakerId =
        settings.selectedAudioOutputId ||
        devList.audioOutputs[0]?.deviceId ||
        'default';
      setSelectedSpeakerId(activeSpeakerId);

      // Determine active camera
      const activeCamId =
        (currentVideoTrack?.getSettings()?.deviceId as string | undefined) ||
        settings.selectedVideoInputId ||
        devList.videoInputs[0]?.deviceId ||
        'default';
      setSelectedCameraId(activeCamId);
    };

    void fetchDevices();
    const unbind = onDeviceChange(() => {
      void fetchDevices();
    });

    return () => {
      mounted = false;
      unbind();
    };
  }, [isOpen, currentAudioTrack, currentVideoTrack, settings]);

  // Acquire or link audio track for volume meter
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    let localStream: MediaStream | null = null;

    const setupMicMeter = async () => {
      // If currentAudioTrack is provided and matches the selected device (or is default), use it
      const currentTrackDevice = currentAudioTrack?.getSettings()?.deviceId;
      if (
        currentAudioTrack &&
        (!selectedMicId || selectedMicId === 'default' || currentTrackDevice === selectedMicId)
      ) {
        setPreviewAudioTrack(currentAudioTrack);
        return;
      }

      // Otherwise, request temporary mic stream for live meter verification in modal
      if (navigator.mediaDevices?.getUserMedia && selectedMicId) {
        try {
          const constraints = getAudioConstraints(selectedMicId, {
            echoCancellation,
            noiseSuppression,
            autoGainControl,
          });
          const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          localStream = stream;
          const track = stream.getAudioTracks()[0] ?? null;
          setPreviewAudioTrack(track);
        } catch (err) {
          console.warn('[SettingsModal] Could not get preview audio track:', err);
          setPreviewAudioTrack(currentAudioTrack ?? null);
        }
      } else {
        setPreviewAudioTrack(currentAudioTrack ?? null);
      }
    };

    void setupMicMeter();

    return () => {
      cancelled = true;
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [
    isOpen,
    selectedMicId,
    currentAudioTrack,
    echoCancellation,
    noiseSuppression,
    autoGainControl,
  ]);

  // Connect mic volume meter to the active audio track
  useEffect(() => {
    if (!isOpen || !previewAudioTrack) {
      setVolumeLevel(0);
      return;
    }

    const stopMeter = createMicVolumeMeter(previewAudioTrack, (level) => {
      setVolumeLevel(level);
    });

    return () => {
      stopMeter();
      setVolumeLevel(0);
    };
  }, [isOpen, previewAudioTrack]);

  // Setup video preview track
  useEffect(() => {
    if (!isOpen || activeTab !== 'video') {
      return;
    }

    let cancelled = false;
    let localStream: MediaStream | null = null;

    const setupCameraPreview = async () => {
      const currentTrackDevice = currentVideoTrack?.getSettings()?.deviceId;
      if (
        currentVideoTrack &&
        (!selectedCameraId || selectedCameraId === 'default' || currentTrackDevice === selectedCameraId)
      ) {
        setPreviewVideoTrack(currentVideoTrack);
        return;
      }

      if (navigator.mediaDevices?.getUserMedia && selectedCameraId) {
        try {
          const constraints = getVideoConstraints(selectedCameraId, dataSaverMode);
          const stream = await navigator.mediaDevices.getUserMedia({ video: constraints });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          localStream = stream;
          const track = stream.getVideoTracks()[0] ?? null;
          setPreviewVideoTrack(track);
        } catch (err) {
          console.warn('[SettingsModal] Could not get preview video track:', err);
          setPreviewVideoTrack(currentVideoTrack ?? null);
        }
      } else {
        setPreviewVideoTrack(currentVideoTrack ?? null);
      }
    };

    void setupCameraPreview();

    return () => {
      cancelled = true;
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isOpen, activeTab, selectedCameraId, currentVideoTrack, dataSaverMode]);

  // Bind preview video track to video tag
  useEffect(() => {
    if (previewVideoRef.current) {
      if (previewVideoTrack) {
        previewVideoRef.current.srcObject = new MediaStream([previewVideoTrack]);
      } else {
        previewVideoRef.current.srcObject = null;
      }
    }
  }, [previewVideoTrack, activeTab]);

  // Keyboard navigation: Escape key closes modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handlers for device selection
  const handleMicSelect = (deviceId: string) => {
    setSelectedMicId(deviceId);
    saveStoredSettings({ selectedAudioInputId: deviceId });
    if (onMicChange) {
      void onMicChange(deviceId);
    }
  };

  const handleSpeakerSelect = (deviceId: string) => {
    setSelectedSpeakerId(deviceId);
    saveStoredSettings({ selectedAudioOutputId: deviceId });
    if (onSpeakerChange) {
      void onSpeakerChange(deviceId);
    }
  };

  const handleCameraSelect = (deviceId: string) => {
    setSelectedCameraId(deviceId);
    saveStoredSettings({ selectedVideoInputId: deviceId });
    if (onCameraChange) {
      void onCameraChange(deviceId);
    }
  };

  // Test speaker chime
  const handleTestSpeaker = async () => {
    if (isTestingSpeaker) return;
    setIsTestingSpeaker(true);
    try {
      await testAudioOutput(selectedSpeakerId || undefined);
    } catch (err) {
      console.warn('[SettingsModal] testAudioOutput error:', err);
    } finally {
      setIsTestingSpeaker(false);
    }
  };

  // Audio toggles
  const handleToggleEcho = (enabled: boolean) => {
    setEchoCancellation(enabled);
    saveStoredSettings({ echoCancellation: enabled });
    onEchoCancellationChange?.(enabled);
  };

  const handleToggleNoise = (enabled: boolean) => {
    setNoiseSuppression(enabled);
    saveStoredSettings({ noiseSuppression: enabled });
    onNoiseSuppressionChange?.(enabled);
  };

  const handleToggleAgc = (enabled: boolean) => {
    setAutoGainControl(enabled);
    saveStoredSettings({ autoGainControl: enabled });
    onAutoGainControlChange?.(enabled);
  };

  // Video toggles
  const handleToggleMirror = (enabled: boolean) => {
    setMirrorSelfView(enabled);
    saveStoredSettings({ mirrorSelfView: enabled });
    onMirrorSelfViewChange?.(enabled);
  };

  // General toggles
  const handleToggleDataSaver = (enabled: boolean) => {
    setDataSaverMode(enabled);
    saveStoredSettings({ dataSaverMode: enabled });
    onDataSaverChange?.(enabled);
  };

  // Close on outside backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="settings-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-heading"
    >
      <div className="settings-modal" ref={modalRef}>
        {/* Header */}
        <div className="settings-header">
          <div className="settings-title-group">
            <div className="settings-title-icon">
              <SlidersIcon size={22} />
            </div>
            <h2 id="settings-heading" className="settings-title">
              Settings
            </h2>
          </div>
          <button
            type="button"
            className="settings-close-btn"
            onClick={onClose}
            aria-label="Close settings"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Tab selection */}
        <div className="settings-tabs-container">
          <div className="settings-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'audio'}
              className={`settings-tab-btn ${activeTab === 'audio' ? 'active' : ''}`}
              onClick={() => setActiveTab('audio')}
            >
              <MicIcon width={17} height={17} />
              <span>Audio</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'video'}
              className={`settings-tab-btn ${activeTab === 'video' ? 'active' : ''}`}
              onClick={() => setActiveTab('video')}
            >
              <CamIcon width={17} height={17} />
              <span>Video</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'general'}
              className={`settings-tab-btn ${activeTab === 'general' ? 'active' : ''}`}
              onClick={() => setActiveTab('general')}
            >
              <InfoIcon size={17} />
              <span>General</span>
            </button>
          </div>
        </div>

        {/* Tab Content Body */}
        <div className="settings-body">
          {/* ================= AUDIO TAB ================= */}
          {activeTab === 'audio' && (
            <>
              {/* Microphone Selector */}
              <div className="settings-field">
                <label className="settings-field-label" htmlFor="mic-select">
                  <span>Microphone</span>
                  {devices.audioInputs.length > 0 && (
                    <span className="settings-field-hint">
                      {devices.audioInputs.length} available
                    </span>
                  )}
                </label>
                <div className="settings-select-wrapper">
                  <select
                    id="mic-select"
                    className="settings-select"
                    value={selectedMicId}
                    onChange={(e) => handleMicSelect(e.target.value)}
                  >
                    {devices.audioInputs.length === 0 ? (
                      <option value="">Default Microphone</option>
                    ) : (
                      devices.audioInputs.map((d: DeviceOption, i: number) => (
                        <option key={d.deviceId || `mic-${i}`} value={d.deviceId}>
                          {d.label}
                        </option>
                      ))
                    )}
                  </select>
                  <div className="settings-select-icon">
                    <ChevronDownIcon size={16} />
                  </div>
                </div>

                {/* Live Mic Volume Meter */}
                <div className="mic-meter-box" aria-live="polite">
                  <div className="mic-meter-header">
                    <span className="mic-meter-title">
                      <MicIcon width={14} height={14} />
                      Input Level
                    </span>
                    <span className="mic-meter-level-text">
                      {volumeLevel > 0 ? `${volumeLevel}%` : 'Silent'}
                    </span>
                  </div>
                  <div className="mic-meter-track" role="progressbar" aria-valuenow={volumeLevel} aria-valuemin={0} aria-valuemax={100}>
                    <div
                      className="mic-meter-fill"
                      style={{ width: `${Math.min(100, Math.max(0, volumeLevel))}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Speaker / Output Selector */}
              <div className="settings-field">
                <label className="settings-field-label" htmlFor="speaker-select">
                  <span>Speaker / Output</span>
                  {audioOutputSupported && devices.audioOutputs.length > 0 && (
                    <span className="settings-field-hint">
                      {devices.audioOutputs.length} available
                    </span>
                  )}
                </label>

                <div className="speaker-row">
                  <div className="settings-select-wrapper speaker-select-col">
                    <select
                      id="speaker-select"
                      className="settings-select"
                      value={selectedSpeakerId}
                      onChange={(e) => handleSpeakerSelect(e.target.value)}
                      disabled={!audioOutputSupported && devices.audioOutputs.length === 0}
                    >
                      {devices.audioOutputs.length === 0 ? (
                        <option value="">Default Speaker</option>
                      ) : (
                        devices.audioOutputs.map((d: DeviceOption, i: number) => (
                          <option key={d.deviceId || `speaker-${i}`} value={d.deviceId}>
                            {d.label}
                          </option>
                        ))
                      )}
                    </select>
                    <div className="settings-select-icon">
                      <ChevronDownIcon size={16} />
                    </div>
                  </div>

                  <button
                    type="button"
                    className={`test-speaker-btn ${isTestingSpeaker ? 'testing' : ''}`}
                    onClick={handleTestSpeaker}
                    disabled={isTestingSpeaker}
                    aria-label="Test speaker tone"
                  >
                    <VolumeIcon width={18} height={18} />
                    <span>{isTestingSpeaker ? 'Testing…' : 'Test Sound'}</span>
                  </button>
                </div>

                {!audioOutputSupported && (
                  <p className="speaker-notice">
                    Device output selection is managed by your browser or operating system on this platform.
                  </p>
                )}
              </div>

              {/* Audio Processing Toggles */}
              <div className="settings-toggle-group">
                <label className="settings-toggle-card">
                  <div className="toggle-text">
                    <span className="toggle-title">Echo Cancellation</span>
                    <span className="toggle-desc">
                      Eliminates speaker acoustic feedback and background loops.
                    </span>
                  </div>
                  <span className="switch">
                    <input
                      type="checkbox"
                      checked={echoCancellation}
                      onChange={(e) => handleToggleEcho(e.target.checked)}
                    />
                    <span className="slider" />
                  </span>
                </label>

                <label className="settings-toggle-card">
                  <div className="toggle-text">
                    <span className="toggle-title">Noise Suppression</span>
                    <span className="toggle-desc">
                      Removes computer fans, keyboard clicks, and steady room noise.
                    </span>
                  </div>
                  <span className="switch">
                    <input
                      type="checkbox"
                      checked={noiseSuppression}
                      onChange={(e) => handleToggleNoise(e.target.checked)}
                    />
                    <span className="slider" />
                  </span>
                </label>

                <label className="settings-toggle-card">
                  <div className="toggle-text">
                    <span className="toggle-title">Automatic Gain Control</span>
                    <span className="toggle-desc">
                      Normalizes your mic level so you stay audible when leaning back.
                    </span>
                  </div>
                  <span className="switch">
                    <input
                      type="checkbox"
                      checked={autoGainControl}
                      onChange={(e) => handleToggleAgc(e.target.checked)}
                    />
                    <span className="slider" />
                  </span>
                </label>
              </div>
            </>
          )}

          {/* ================= VIDEO TAB ================= */}
          {activeTab === 'video' && (
            <>
              {/* Camera Selector */}
              <div className="settings-field">
                <label className="settings-field-label" htmlFor="camera-select">
                  <span>Camera</span>
                  {devices.videoInputs.length > 0 && (
                    <span className="settings-field-hint">
                      {devices.videoInputs.length} available
                    </span>
                  )}
                </label>
                <div className="settings-select-wrapper">
                  <select
                    id="camera-select"
                    className="settings-select"
                    value={selectedCameraId}
                    onChange={(e) => handleCameraSelect(e.target.value)}
                  >
                    {devices.videoInputs.length === 0 ? (
                      <option value="">Default Camera</option>
                    ) : (
                      devices.videoInputs.map((d: DeviceOption, i: number) => (
                        <option key={d.deviceId || `cam-${i}`} value={d.deviceId}>
                          {d.label}
                        </option>
                      ))
                    )}
                  </select>
                  <div className="settings-select-icon">
                    <ChevronDownIcon size={16} />
                  </div>
                </div>
              </div>

              {/* Mini Preview Tile */}
              <div className="video-preview-tile">
                <div className="preview-badge">
                  <span className="preview-dot" />
                  <span>Preview</span>
                </div>
                {previewVideoTrack ? (
                  <video
                    ref={previewVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={mirrorSelfView ? 'mirrored' : ''}
                  />
                ) : (
                  <div className="video-preview-placeholder">
                    <CamIcon width={32} height={32} />
                    <span>Camera is inactive or preview is loading</span>
                  </div>
                )}
              </div>

              {/* Mirror Video Toggle */}
              <div className="settings-toggle-group">
                <label className="settings-toggle-card">
                  <div className="toggle-text">
                    <span className="toggle-title">Mirror Self-View</span>
                    <span className="toggle-desc">
                      Flip your local camera preview horizontally like a natural mirror.
                    </span>
                  </div>
                  <span className="switch">
                    <input
                      type="checkbox"
                      checked={mirrorSelfView}
                      onChange={(e) => handleToggleMirror(e.target.checked)}
                    />
                    <span className="slider" />
                  </span>
                </label>
              </div>
            </>
          )}

          {/* ================= GENERAL / BANDWIDTH TAB ================= */}
          {activeTab === 'general' && (
            <>
              {/* Data Saver Mode Toggle */}
              <div className="settings-toggle-group">
                <label className="settings-toggle-card">
                  <div className="toggle-text">
                    <span className="toggle-title">Data Saver Mode</span>
                    <span className="toggle-desc">
                      Caps video resolution at 360p (20–24 fps) to save mobile bandwidth and stabilize weak cellular connections.
                    </span>
                  </div>
                  <span className="switch">
                    <input
                      type="checkbox"
                      checked={dataSaverMode}
                      onChange={(e) => handleToggleDataSaver(e.target.checked)}
                    />
                    <span className="slider" />
                  </span>
                </label>
              </div>

              {/* App Info Card */}
              <div className="info-card">
                <div className="info-card-header">
                  <div className="info-app-details">
                    <h3>Huddle · Video Meetings</h3>
                    <p>Zero-install, peer-to-peer video calls that work in any browser.</p>
                  </div>
                </div>

                <div className="info-badges-list">
                  <span className="info-chip purple">Version 0.1.0</span>
                  <span className="info-chip cyan">WebRTC Mesh</span>
                  <span className="info-chip">Zero Accounts</span>
                  <span className="info-chip">End-to-End Direct P2P</span>
                  <span className="info-chip">
                    Output Routing: {audioOutputSupported ? 'Supported' : 'System Default'}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="settings-footer">
          <button type="button" className="settings-done-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
