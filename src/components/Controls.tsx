import type { LocalState } from '../types';
import {
  CamIcon,
  CamOffIcon,
  FlipIcon,
  LinkIcon,
  MicIcon,
  MicOffIcon,
  PhoneOffIcon,
  PipIcon,
  ScreenIcon,
} from './Icons';

export type ControlsProps = {
  local: LocalState;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onFlipCam: () => void;
  onToggleScreenShare: () => void;
  onTogglePip: () => void;
  onCopyLink: () => void;
  onLeave: () => void;
  pipAvailable: boolean;
};

export function Controls({
  local,
  onToggleMic,
  onToggleCam,
  onFlipCam,
  onToggleScreenShare,
  onTogglePip,
  onCopyLink,
  onLeave,
  pipAvailable,
}: ControlsProps) {
  return (
    <div className="controls-dock">
      <div className="controls-bar">
        {/* Microphone */}
        <button
          type="button"
          onClick={onToggleMic}
          className={`ctrl-btn ${!local.audioEnabled ? 'off' : ''}`}
          data-tip={local.audioEnabled ? 'Mute' : 'Unmute'}
          aria-label={local.audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
        >
          {local.audioEnabled ? <MicIcon width={22} height={22} /> : <MicOffIcon width={22} height={22} />}
        </button>

        {/* Camera */}
        <button
          type="button"
          onClick={onToggleCam}
          className={`ctrl-btn ${!local.videoEnabled ? 'off' : ''}`}
          data-tip={local.videoEnabled ? 'Stop Video' : 'Start Video'}
          aria-label={local.videoEnabled ? 'Stop camera' : 'Start camera'}
        >
          {local.videoEnabled ? <CamIcon width={22} height={22} /> : <CamOffIcon width={22} height={22} />}
        </button>

        {/* Flip Camera (Mobile) */}
        {local.canFlip && (
          <button
            type="button"
            onClick={onFlipCam}
            className="ctrl-btn"
            data-tip="Flip Camera"
            aria-label="Flip between front and back camera"
          >
            <FlipIcon width={22} height={22} />
          </button>
        )}

        {/* Screen Share (Desktop) */}
        {local.canScreenShare && (
          <button
            type="button"
            onClick={onToggleScreenShare}
            className={`ctrl-btn ${local.screenSharing ? 'highlight' : ''}`}
            data-tip={local.screenSharing ? 'Stop Sharing' : 'Share Screen'}
            aria-label="Share screen"
          >
            <ScreenIcon width={22} height={22} />
          </button>
        )}

        {/* Picture-in-Picture / Background Mode */}
        {pipAvailable && (
          <button
            type="button"
            onClick={onTogglePip}
            className="ctrl-btn highlight"
            data-tip="Background (PiP)"
            aria-label="Pop out Picture-in-Picture to use other apps"
          >
            <PipIcon width={22} height={22} />
          </button>
        )}

        {/* Copy Invite Link */}
        <button
          type="button"
          onClick={onCopyLink}
          className="ctrl-btn"
          data-tip="Invite Friends"
          aria-label="Copy invite link"
        >
          <LinkIcon width={22} height={22} />
        </button>

        {/* Leave Call */}
        <button
          type="button"
          onClick={onLeave}
          className="ctrl-btn hangup"
          data-tip="Leave Call"
          aria-label="Leave call"
        >
          <PhoneOffIcon width={22} height={22} />
        </button>
      </div>
    </div>
  );
}
