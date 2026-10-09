import { useEffect, useRef } from 'react';
import type { ConnectionStatus } from '../types';
import { MicOffIcon, ScreenIcon } from './Icons';

export type VideoTileProps = {
  id: string;
  name: string;
  stream: MediaStream | null;
  isLocal?: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing?: boolean;
  isSpeaking?: boolean;
  connection?: ConnectionStatus;
  style?: React.CSSProperties;
  onVideoRef?: (el: HTMLVideoElement | null) => void;
};

export function VideoTile({
  name,
  stream,
  isLocal = false,
  audioEnabled,
  videoEnabled,
  screenSharing = false,
  isSpeaking = false,
  connection = 'connected',
  style,
  onVideoRef,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Attach stream to video element
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
  }, [stream]);

  // For remote peers, bind stream to a dedicated <audio> element.
  // We keep <video> muted={true} so the OS doesn't kill audio when it pauses the video element.
  useEffect(() => {
    if (isLocal) return;
    const ael = audioRef.current;
    if (!ael) return;
    if (ael.srcObject !== stream) {
      ael.srcObject = stream;
    }
    const ensurePlay = () => {
      if (ael) {
        void ael.play().catch(() => {});
      }
    };
    ensurePlay();
    document.addEventListener('visibilitychange', ensurePlay);
    window.addEventListener('touchstart', ensurePlay, { once: true });
    window.addEventListener('click', ensurePlay, { once: true });
    return () => {
      document.removeEventListener('visibilitychange', ensurePlay);
      window.removeEventListener('touchstart', ensurePlay);
      window.removeEventListener('click', ensurePlay);
    };
  }, [stream, isLocal]);

  useEffect(() => {
    if (onVideoRef) {
      onVideoRef(videoRef.current);
    }
  }, [onVideoRef]);

  const initial = (name.trim()[0] || '?').toUpperCase();
  const showVideo = (videoEnabled || screenSharing) && !!stream;

  return (
    <div
      className={`video-tile ${isSpeaking ? 'speaking' : ''}`}
      style={style}
    >
      {/* Remote audio playback element (unmuted, handles 100% of audio output) */}
      {!isLocal && (
        <audio
          ref={audioRef}
          autoPlay
          playsInline
        />
      )}

      {/* Video stream element (ALWAYS muted so mobile browsers never kill audio when pausing video) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={true}
        className={`tile-media ${isLocal && !screenSharing ? 'mirrored' : ''}`}
        style={{ display: showVideo ? 'block' : 'none' }}
      />

      {/* Fallback avatar when camera is off */}
      {!showVideo && (
        <div className="tile-avatar-view">
          <div className="tile-avatar-bubble">{initial}</div>
        </div>
      )}

      {/* Reconnecting overlay */}
      {connection === 'reconnecting' && (
        <div className="reconnecting-overlay">
          <span>Reconnecting…</span>
        </div>
      )}

      {/* Bottom overlay: Name and status badges */}
      <div className="tile-overlay-bottom">
        <div className="tile-name-tag">
          {name} {isLocal && '(You)'}
        </div>

        <div className="tile-status-icons">
          {screenSharing && (
            <div className="status-badge" title="Sharing screen">
              <ScreenIcon width={14} height={14} />
            </div>
          )}
          {!audioEnabled && (
            <div className="status-badge muted" title="Muted">
              <MicOffIcon width={14} height={14} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
