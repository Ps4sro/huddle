import { useEffect, useRef, useState } from 'react';
import type { FacingMode } from '../types';
import {
  acquireInitialMedia,
  describeMediaError,
  type MediaErrorKind,
} from '../lib/media';
import { generateRoomId, parseRoomInput } from '../lib/rooms';
import { unlockAudio } from '../lib/background';
import { startSilentAudioKeepAlive } from '../lib/audioKeeper';
import { ArrowIcon, CamIcon, CamOffIcon, Logo, MicIcon, MicOffIcon } from './Icons';

export type LobbyProps = {
  initialRoomId: string | null;
  onJoin: (opts: {
    roomId: string;
    name: string;
    audioTrack: MediaStreamTrack | null;
    videoTrack: MediaStreamTrack | null;
    audioEnabled: boolean;
    videoEnabled: boolean;
    facingMode: FacingMode;
  }) => void;
};

const NAME_STORAGE_KEY = 'huddle_user_name';

export function Lobby({ initialRoomId, onJoin }: LobbyProps) {
  const [name, setName] = useState(() => localStorage.getItem(NAME_STORAGE_KEY) || '');
  const [roomInput, setRoomInput] = useState(() => initialRoomId || generateRoomId());
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [facingMode] = useState<FacingMode>('user');

  const [audioTrack, setAudioTrack] = useState<MediaStreamTrack | null>(null);
  const [videoTrack, setVideoTrack] = useState<MediaStreamTrack | null>(null);
  const [mediaError, setMediaError] = useState<MediaErrorKind | null>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);

  // Request camera and microphone on mount for preview
  useEffect(() => {
    let cancelled = false;
    async function initMedia() {
      const { audio, video, error } = await acquireInitialMedia(facingMode);
      if (cancelled) {
        audio?.stop();
        video?.stop();
        return;
      }
      setAudioTrack(audio);
      setVideoTrack(video);
      setMediaError(error);

      const tracks: MediaStreamTrack[] = [];
      if (video) tracks.push(video);
      if (audio) tracks.push(audio);
      if (tracks.length > 0) {
        setPreviewStream(new MediaStream(tracks));
      }
    }
    void initMedia();
    return () => {
      cancelled = true;
    };
  }, [facingMode]);

  // Attach stream to preview video element
  useEffect(() => {
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = previewStream;
    }
  }, [previewStream]);

  // Handle local track enable/disable toggles in preview
  const handleToggleMic = () => {
    const next = !audioEnabled;
    setAudioEnabled(next);
    if (audioTrack) {
      audioTrack.enabled = next;
    }
  };

  const handleToggleCam = () => {
    const next = !videoEnabled;
    setVideoEnabled(next);
    if (videoTrack) {
      videoTrack.enabled = next;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;

    const parsedRoom = parseRoomInput(roomInput) || generateRoomId();

    // Persist name in localStorage
    try {
      localStorage.setItem(NAME_STORAGE_KEY, cleanName);
    } catch {
      /* ignore */
    }

    // Unlock audio context and start background keep-alive directly from this user tap!
    unlockAudio();
    startSilentAudioKeepAlive();

    onJoin({
      roomId: parsedRoom,
      name: cleanName,
      audioTrack,
      videoTrack,
      audioEnabled,
      videoEnabled,
      facingMode,
    });
  };

  const avatarInitial = (name.trim()[0] || '?').toUpperCase();
  const showVideo = videoEnabled && !!videoTrack;

  return (
    <div className="lobby-wrapper">
      <div className="lobby-card glass-panel">
        <div className="lobby-header">
          <Logo size={36} />
          <div>
            <h1>Huddle</h1>
            <p className="lobby-subtitle">
              Instant group video calls. No apps, no sign-ups.
            </p>
          </div>
        </div>

        {/* Video / Avatar Preview */}
        <div className="preview-container">
          <video
            ref={videoPreviewRef}
            autoPlay
            playsInline
            muted
            className="preview-video"
            style={{ display: showVideo ? 'block' : 'none' }}
          />

          {!showVideo && <div className="preview-avatar">{avatarInitial}</div>}

          <div className="preview-controls">
            <button
              type="button"
              onClick={handleToggleMic}
              className={`circle-btn ${!audioEnabled ? 'off' : ''}`}
              title={audioEnabled ? 'Mute Mic' : 'Unmute Mic'}
              aria-label={audioEnabled ? 'Mute Mic' : 'Unmute Mic'}
            >
              {audioEnabled ? <MicIcon width={20} height={20} /> : <MicOffIcon width={20} height={20} />}
            </button>
            <button
              type="button"
              onClick={handleToggleCam}
              className={`circle-btn ${!videoEnabled ? 'off' : ''}`}
              title={videoEnabled ? 'Stop Camera' : 'Start Camera'}
              aria-label={videoEnabled ? 'Stop Camera' : 'Start Camera'}
            >
              {videoEnabled ? <CamIcon width={20} height={20} /> : <CamOffIcon width={20} height={20} />}
            </button>
          </div>
        </div>

        {mediaError && (
          <div className="tip-banner" style={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#fca5a5' }}>
            <span>⚠️ {describeMediaError(mediaError)}</span>
          </div>
        )}

        {/* Join Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="input-group">
            <label htmlFor="user-name-input" className="input-label">
              Your Name
            </label>
            <input
              id="user-name-input"
              type="text"
              className="text-input"
              placeholder="What should friends call you?"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={32}
              required
              autoFocus
            />
          </div>

          <div className="input-group">
            <label htmlFor="room-input" className="input-label">
              Room Link or Code
            </label>
            <input
              id="room-input"
              type="text"
              className="text-input"
              placeholder="e.g. cozy-panda-123"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={!name.trim()}
          >
            <span>{initialRoomId ? 'Join Call' : 'Start Call'}</span>
            <ArrowIcon width={18} height={18} />
          </button>
        </form>

        <div className="tip-banner">
          <span>
            💡 <strong>Works anywhere:</strong> iPhones, Android phones, Windows, and Mac. Audio stays alive when multitasking or using other apps.
          </span>
        </div>
      </div>
    </div>
  );
}
