// Shared types — mirrors PROTOCOL.md at the project root.

export type PeerInfo = {
  id: string;
  name: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
};

export type SignalData =
  | { description: RTCSessionDescriptionInit }
  | { candidate: RTCIceCandidateInit | null };

export type JoinError = 'room-full' | 'invalid-room' | 'invalid-name';

export type JoinAck =
  | { ok: true; selfId: string; peers: PeerInfo[]; iceServers: RTCIceServer[] }
  | { ok: false; error: JoinError };

export type MediaState = {
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
};

export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting';

export type RemoteParticipant = {
  id: string;
  name: string;
  /** Fresh MediaStream instance whenever the set of remote tracks changes. */
  stream: MediaStream;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
  connection: ConnectionStatus;
};

export type FacingMode = 'user' | 'environment';

export type LocalState = {
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
  facingMode: FacingMode;
  /** Whatever we're currently sending as video (camera or screen), for self-view. */
  previewStream: MediaStream | null;
  hasMic: boolean;
  canFlip: boolean;
  canScreenShare: boolean;
};

export type CallStatus = 'joining' | 'joined' | 'reconnecting' | 'error' | 'left';

export type CallSnapshot = {
  status: CallStatus;
  error: JoinError | 'timeout' | null;
  selfId: string | null;
  roomId: string;
  name: string;
  participants: RemoteParticipant[];
  local: LocalState;
};

export type CallEvent =
  | { type: 'peer-joined'; name: string }
  | { type: 'peer-left'; name: string }
  | { type: 'media-error'; message: string };
