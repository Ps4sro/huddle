// Huddle signaling server.
//
// The server is only a matchmaker: it relays SDP offers/answers and ICE
// candidates between browsers in the same room. Audio/video never touches it.
// See PROTOCOL.md for the exact contract.

import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = Number.parseInt(process.env.PORT ?? '', 10) || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_PEERS_PER_ROOM = 6;
const MAX_NAME_LENGTH = 32;
const ROOM_ID_RE = /^[a-z0-9-]{3,64}$/;
const CLIENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_SOCKET_ID_LENGTH = 64;
const MAX_SDP_LENGTH = 60_000;
const MAX_CANDIDATE_LENGTH = 2_048;
// Built client. STATIC_DIR is an override used for testing; normally ../dist.
const DIST_DIR = path.resolve(process.env.STATIC_DIR || path.join(__dirname, '..', 'dist'));

function buildIceServers() {
  /** @type {Array<{urls: string | string[], username?: string, credential?: string}>} */
  const servers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  const turnUrls = (process.env.TURN_URLS || '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  if (turnUrls.length > 0) {
    const turn = { urls: turnUrls };
    if (process.env.TURN_USERNAME) turn.username = process.env.TURN_USERNAME;
    if (process.env.TURN_CREDENTIAL) turn.credential = process.env.TURN_CREDENTIAL;
    servers.push(turn);
  }
  return servers;
}

const ICE_SERVERS = buildIceServers();

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isBool = (v) => typeof v === 'boolean';

/** Returns a cleaned display name (1..32 UTF-16 units) or null if invalid. */
function sanitizeName(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .slice(0, 1000)
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Truncate without splitting surrogate pairs (emoji).
  let out = '';
  for (const ch of cleaned) {
    if (out.length + ch.length > MAX_NAME_LENGTH) break;
    out += ch;
  }
  out = out.trim();
  return out.length > 0 ? out : null;
}

/** Rebuilds a SignalData payload from known fields only, or returns null. */
function sanitizeSignalData(data) {
  if (!isObject(data)) return null;

  if ('description' in data) {
    const d = data.description;
    if (!isObject(d)) return null;
    if (!['offer', 'answer', 'pranswer', 'rollback'].includes(d.type)) return null;
    const description = { type: d.type };
    if (d.sdp !== undefined) {
      if (typeof d.sdp !== 'string' || d.sdp.length > MAX_SDP_LENGTH) return null;
      description.sdp = d.sdp;
    }
    return { description };
  }

  if ('candidate' in data) {
    const c = data.candidate;
    if (c === null) return { candidate: null }; // end-of-candidates
    if (!isObject(c)) return null;
    const candidate = {};
    if (c.candidate !== undefined) {
      if (typeof c.candidate !== 'string' || c.candidate.length > MAX_CANDIDATE_LENGTH) return null;
      candidate.candidate = c.candidate;
    }
    if (c.sdpMid !== undefined) {
      if (c.sdpMid !== null && (typeof c.sdpMid !== 'string' || c.sdpMid.length > 256)) return null;
      candidate.sdpMid = c.sdpMid;
    }
    if (c.sdpMLineIndex !== undefined) {
      if (c.sdpMLineIndex !== null && !(Number.isInteger(c.sdpMLineIndex) && c.sdpMLineIndex >= 0 && c.sdpMLineIndex < 1024)) return null;
      candidate.sdpMLineIndex = c.sdpMLineIndex;
    }
    if (c.usernameFragment !== undefined) {
      if (c.usernameFragment !== null && (typeof c.usernameFragment !== 'string' || c.usernameFragment.length > 256)) return null;
      candidate.usernameFragment = c.usernameFragment;
    }
    return { candidate };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Room state
// ---------------------------------------------------------------------------

/** @type {Map<string, Map<string, {id: string, name: string, audioEnabled: boolean, videoEnabled: boolean, screenSharing: boolean}>>} */
const rooms = new Map();

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

/** Removes a socket from its current room (if any) and notifies the others. */
function leaveCurrentRoom(socket, reason) {
  const roomId = socket.data.roomId;
  if (!roomId) return;
  socket.data.roomId = undefined;
  socket.leave(roomId);

  const room = rooms.get(roomId);
  if (!room) return;
  const info = room.get(socket.id);
  room.delete(socket.id);
  if (room.size === 0) rooms.delete(roomId);
  if (info) {
    socket.to(roomId).emit('peer-left', { id: socket.id });
    log(`[leave] room=${roomId} id=${socket.id} name=${JSON.stringify(info.name)} reason=${reason} (${room.size}/${MAX_PEERS_PER_ROOM})`);
  }
}

/** Ids of other sockets in `room` that belong to the same tab (same clientId). */
function findGhosts(room, clientId, selfId) {
  const ghosts = [];
  for (const id of room.keys()) {
    if (id === selfId) continue;
    if (io.sockets.sockets.get(id)?.data.clientId === clientId) ghosts.push(id);
  }
  return ghosts;
}

/** Removes a stale socket from a room, tells the room, and disconnects it. */
function evictGhost(roomId, ghostId) {
  const ghost = io.sockets.sockets.get(ghostId);
  if (ghost) {
    leaveCurrentRoom(ghost, 'replaced-by-reconnect');
    ghost.disconnect(true);
    return;
  }
  // Socket already gone but somehow still listed: clean up directly.
  const room = rooms.get(roomId);
  if (room?.delete(ghostId)) {
    if (room.size === 0) rooms.delete(roomId);
    io.to(roomId).emit('peer-left', { id: ghostId });
  }
}

/** Wraps a socket event handler so malformed input can never crash the process. */
function safe(event, handler) {
  return (...args) => {
    try {
      handler(...args);
    } catch (err) {
      log(`[error] handler "${event}" threw:`, err && err.stack ? err.stack : err);
    }
  };
}

// ---------------------------------------------------------------------------
// HTTP (Express)
// ---------------------------------------------------------------------------

const app = express();
app.disable('x-powered-by');
// Behind Render / Railway / Fly / cloudflared the TLS terminates at a proxy.
app.set('trust proxy', true);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // Explicitly ALLOW the powerful features a video call needs (for our own
  // origin) and disable a few we never use.
  res.setHeader(
    'Permissions-Policy',
    'camera=(self), microphone=(self), display-capture=(self), picture-in-picture=(self), ' +
      'fullscreen=(self), autoplay=(self), geolocation=(), payment=(), usb=()',
  );
  if (req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  }
  next();
});

app.get('/api/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, rooms: rooms.size });
});

app.all('/api/*', (_req, res) => {
  res.status(404).json({ ok: false, error: 'not-found' });
});

const hasDist = existsSync(path.join(DIST_DIR, 'index.html'));

if (hasDist) {
  const indexHtml = path.join(DIST_DIR, 'index.html');

  app.use(
    express.static(DIST_DIR, {
      index: 'index.html',
      redirect: false,
      setHeaders(res, filePath) {
        const rel = path.relative(DIST_DIR, filePath).split(path.sep).join('/');
        const base = path.basename(filePath);
        if (rel.startsWith('assets/')) {
          // Vite content-hashes everything under /assets.
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (base === 'sw.js' || base === 'manifest.webmanifest' || base === 'index.html') {
          res.setHeader('Cache-Control', 'no-cache');
          if (base === 'manifest.webmanifest') res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=86400');
        }
      },
    }),
  );

  // SPA fallback (e.g. /r/:roomId). Anything that looks like a file (has an
  // extension) or lives under /assets is a genuine 404, so a stale hashed
  // asset never gets index.html served as JavaScript.
  app.get('*', (req, res, next) => {
    const p = req.path;
    if (p === '/api' || p.startsWith('/api/') || p.startsWith('/socket.io') || p.startsWith('/assets/')) return next();
    if (path.posix.basename(p).includes('.')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });
} else {
  app.get('/', (_req, res) => {
    res
      .type('text/plain')
      .send('Huddle signaling server is running.\nIn development open http://localhost:5173 (npm run dev).\nFor production run `npm run build` first so dist/ can be served.\n');
  });
}

app.use((_req, res) => {
  res.status(404).type('text/plain').send('Not found');
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  log('[error] http:', err && err.message ? err.message : err);
  if (!res.headersSent) res.status(500).type('text/plain').send('Internal error');
});

// ---------------------------------------------------------------------------
// Socket.io signaling
// ---------------------------------------------------------------------------

const httpServer = createServer(app);

const io = new Server(httpServer, {
  serveClient: false,
  // Generous timeout so a phone that briefly backgrounds the tab (or switches
  // networks) isn't dropped from the room immediately.
  pingInterval: 25_000,
  pingTimeout: 60_000,
  // Only SDP / ICE is relayed; keep messages small.
  maxHttpBufferSize: 64 * 1024,
});

io.on('connection', (socket) => {
  socket.on(
    'join',
    safe('join', (payload, maybeAck) => {
      const ack = typeof maybeAck === 'function' ? maybeAck : () => {};
      if (!isObject(payload)) return ack({ ok: false, error: 'invalid-room' });

      const { roomId } = payload;
      if (typeof roomId !== 'string' || !ROOM_ID_RE.test(roomId)) {
        return ack({ ok: false, error: 'invalid-room' });
      }
      const name = sanitizeName(payload.name);
      if (!name) return ack({ ok: false, error: 'invalid-name' });

      const clientId =
        typeof payload.clientId === 'string' && CLIENT_ID_RE.test(payload.clientId) ? payload.clientId : undefined;

      // Stale sockets from the same tab (e.g. a phone that reconnected with a
      // new socket before the old one ping-timed-out) don't count as members.
      const existing = rooms.get(roomId);
      const ghostIds = existing && clientId ? findGhosts(existing, clientId, socket.id) : [];
      const othersCount = existing
        ? existing.size - (existing.has(socket.id) ? 1 : 0) - ghostIds.length
        : 0;
      if (othersCount >= MAX_PEERS_PER_ROOM) {
        log(`[full] room=${roomId} id=${socket.id} rejected`);
        return ack({ ok: false, error: 'room-full' });
      }

      // A socket may only be in one room; joining again leaves the previous one.
      leaveCurrentRoom(socket, 'rejoin');
      socket.data.clientId = clientId;

      // Evict ghosts BEFORE building the peer list so we never see ourselves.
      for (const ghostId of ghostIds) evictGhost(roomId, ghostId);

      let room = rooms.get(roomId);
      if (!room) {
        room = new Map();
        rooms.set(roomId, room);
      }

      const info = {
        id: socket.id,
        name,
        audioEnabled: isBool(payload.audioEnabled) ? payload.audioEnabled : false,
        videoEnabled: isBool(payload.videoEnabled) ? payload.videoEnabled : false,
        screenSharing: false,
      };
      const peers = Array.from(room.values(), (p) => ({ ...p }));

      room.set(socket.id, info);
      socket.data.roomId = roomId;
      socket.join(roomId);
      socket.to(roomId).emit('peer-joined', { ...info });

      log(`[join] room=${roomId} id=${socket.id} name=${JSON.stringify(name)} (${room.size}/${MAX_PEERS_PER_ROOM})`);
      ack({ ok: true, selfId: socket.id, peers, iceServers: ICE_SERVERS });
    }),
  );

  socket.on(
    'signal',
    safe('signal', (payload) => {
      const roomId = socket.data.roomId;
      if (!roomId || !isObject(payload)) return;
      const { to } = payload;
      if (typeof to !== 'string' || to.length === 0 || to.length > MAX_SOCKET_ID_LENGTH || to === socket.id) return;
      const room = rooms.get(roomId);
      if (!room || !room.has(to) || !room.has(socket.id)) return;
      const data = sanitizeSignalData(payload.data);
      if (!data) return;
      io.to(to).emit('signal', { from: socket.id, data });
    }),
  );

  socket.on(
    'media-state',
    safe('media-state', (payload) => {
      const roomId = socket.data.roomId;
      if (!roomId || !isObject(payload)) return;
      const info = rooms.get(roomId)?.get(socket.id);
      if (!info) return;
      if (isBool(payload.audioEnabled)) info.audioEnabled = payload.audioEnabled;
      if (isBool(payload.videoEnabled)) info.videoEnabled = payload.videoEnabled;
      if (isBool(payload.screenSharing)) info.screenSharing = payload.screenSharing;
      socket.to(roomId).emit('peer-media-state', {
        id: socket.id,
        audioEnabled: info.audioEnabled,
        videoEnabled: info.videoEnabled,
        screenSharing: info.screenSharing,
      });
    }),
  );

  socket.on(
    'chat-message',
    safe('chat-message', (payload) => {
      const roomId = socket.data.roomId;
      if (!roomId || !isObject(payload)) return;
      const info = rooms.get(roomId)?.get(socket.id);
      if (!info) return;
      if (typeof payload.text !== 'string' || !payload.text.trim()) return;
      const text = payload.text.trim().slice(0, 1000);
      const msg = {
        id: typeof payload.id === 'string' ? payload.id.slice(0, 64) : Math.random().toString(36).slice(2),
        senderId: socket.id,
        senderName: info.name,
        text,
        timestamp: Date.now(),
      };
      socket.to(roomId).emit('chat-message', msg);
    }),
  );

  socket.on(
    'reaction',
    safe('reaction', (payload) => {
      const roomId = socket.data.roomId;
      if (!roomId || !isObject(payload)) return;
      const info = rooms.get(roomId)?.get(socket.id);
      if (!info) return;
      if (typeof payload.emoji !== 'string' || !payload.emoji.trim()) return;
      const emoji = payload.emoji.trim().slice(0, 16);
      const reaction = {
        id: typeof payload.id === 'string' ? payload.id.slice(0, 64) : Math.random().toString(36).slice(2),
        senderId: socket.id,
        senderName: info.name,
        emoji,
        timestamp: Date.now(),
      };
      socket.to(roomId).emit('reaction', reaction);
    }),
  );

  socket.on(
    'leave',
    safe('leave', () => leaveCurrentRoom(socket, 'leave')),
  );

  socket.on(
    'disconnect',
    safe('disconnect', (reason) => leaveCurrentRoom(socket, `disconnect:${reason}`)),
  );
});

// ---------------------------------------------------------------------------
// Start / stop
// ---------------------------------------------------------------------------

httpServer.listen(PORT, HOST, () => {
  const turn = ICE_SERVERS.length > 2 ? 'TURN configured' : 'no TURN (STUN only)';
  log(`[huddle] listening on http://${HOST}:${PORT} — ${hasDist ? `serving ${DIST_DIR}` : 'API only (no dist/)'} — ${turn}`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`[huddle] ${signal} received, shutting down`);
  io.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
