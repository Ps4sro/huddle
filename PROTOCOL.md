# Signaling protocol (Socket.io)

The server is **only** a matchmaker: it never sees audio/video. Media flows directly
between browsers over WebRTC (full mesh, max 6 people per room).

## Client → Server

| Event | Payload | Ack |
|---|---|---|
| `join` | `{ roomId: string, name: string, audioEnabled: boolean, videoEnabled: boolean, clientId?: string }` | `{ ok: true, selfId: string, peers: PeerInfo[], iceServers: RTCIceServer[] }` or `{ ok: false, error: 'room-full' \| 'invalid-room' \| 'invalid-name' }` |
| `signal` | `{ to: string, data: SignalData }` | — |
| `media-state` | `{ audioEnabled: boolean, videoEnabled: boolean, screenSharing: boolean }` | — |
| `leave` | — | — |

## Server → Client

| Event | Payload |
|---|---|
| `peer-joined` | `PeerInfo` |
| `peer-left` | `{ id: string }` |
| `signal` | `{ from: string, data: SignalData }` |
| `peer-media-state` | `{ id: string, audioEnabled: boolean, videoEnabled: boolean, screenSharing: boolean }` |

## Types

```ts
type PeerInfo = {
  id: string;            // socket.id
  name: string;          // trimmed, 1..32 chars
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenSharing: boolean;
};

type SignalData =
  | { description: RTCSessionDescriptionInit }
  | { candidate: RTCIceCandidateInit | null };
```

## Rules

- `roomId` must match `/^[a-z0-9-]{3,64}$/`.
- A socket may be in only one room; joining again leaves the previous room.
- `signal` is only relayed if sender and recipient are in the same room.
- On disconnect (or `leave`), the server emits `peer-left` to the rest of the room.
- `clientId` (optional, `/^[A-Za-z0-9_-]{1,64}$/`, ignored if invalid) is a per-tab id that
  survives socket reconnects. When a socket joins a room in which another socket has the
  same `clientId`, the old socket is treated as a stale ghost: it is removed from the room,
  `peer-left { id: oldId }` is emitted to the rest of the room, and the old socket is
  disconnected. This happens before the `peers` list for the ack is built (so the new
  socket never sees its own ghost), and ghosts do not count toward the room limit.
- Names are cleaned server-side (control chars stripped, whitespace collapsed, trimmed,
  truncated to 32 chars); `PeerInfo.name` is the cleaned value.
- Negotiation uses the WebRTC "perfect negotiation" pattern; the peer with the
  lexicographically smaller id is the *polite* peer.

## HTTP

- `GET /api/health` → `{ ok: true, rooms: number }`
- ICE servers: STUN `stun:stun.l.google.com:19302` + `stun:stun1.l.google.com:19302`,
  plus an optional TURN server from env vars `TURN_URLS` (comma-separated),
  `TURN_USERNAME`, `TURN_CREDENTIAL`. Returned in the `join` ack.
