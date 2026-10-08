import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3999;
const SERVER_URL = `http://localhost:${PORT}`;

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('🚀 Starting Huddle server on test port', PORT, '...');
  const server = spawn('node', ['server/index.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  server.stdout.on('data', (d) => process.stdout.write(`[Server] ${d}`));
  server.stderr.on('data', (d) => process.stderr.write(`[Server ERR] ${d}`));

  try {
    // Wait for server to be up
    let up = false;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch(`${SERVER_URL}/api/health`);
        const data = await res.json();
        if (data.ok) {
          up = true;
          console.log('✓ Health check passed:', data);
          break;
        }
      } catch {
        await wait(200);
      }
    }
    if (!up) throw new Error('Server failed to start in time');

    const room = 'test-room-123';

    // 1. Client A connects and joins
    console.log('\n--- Test 1: Client A joins ---');
    const clientA = io(SERVER_URL);
    await new Promise((resolve) => clientA.on('connect', resolve));

    const ackA = await new Promise((resolve) => {
      clientA.emit(
        'join',
        { roomId: room, name: 'Alice', clientId: 'tab-alice', audioEnabled: true, videoEnabled: true },
        resolve,
      );
    });
    console.log('Client A join ack:', ackA);
    if (!ackA.ok || ackA.peers.length !== 0) throw new Error('Client A join failed');

    // 2. Client B joins and receives peer info; Client A gets peer-joined
    console.log('\n--- Test 2: Client B joins ---');
    const clientB = io(SERVER_URL);
    await new Promise((resolve) => clientB.on('connect', resolve));

    const peerJoinedPromise = new Promise((resolve) => clientA.on('peer-joined', resolve));

    const ackB = await new Promise((resolve) => {
      clientB.emit(
        'join',
        { roomId: room, name: 'Bob', clientId: 'tab-bob', audioEnabled: false, videoEnabled: true },
        resolve,
      );
    });
    console.log('Client B join ack:', ackB);
    const peerJoined = await peerJoinedPromise;
    console.log('Client A received peer-joined:', peerJoined);
    if (!ackB.ok || ackB.peers.length !== 1 || ackB.peers[0].name !== 'Alice') {
      throw new Error('Client B did not see Alice');
    }
    if (peerJoined.name !== 'Bob') throw new Error('Client A did not receive Bob join');

    // 3. Signal relay
    console.log('\n--- Test 3: Signal relay between A and B ---');
    const signalPromise = new Promise((resolve) => clientB.on('signal', resolve));
    clientA.emit('signal', { to: ackB.selfId, data: { description: { type: 'offer', sdp: 'v=0...' } } });
    const receivedSignal = await signalPromise;
    console.log('Client B received signal from A:', receivedSignal);
    if (receivedSignal.data.description.type !== 'offer') throw new Error('Signal relay failed');

    // 4. Ghost socket eviction on tab reconnect
    console.log('\n--- Test 4: Reconnecting Client A with same clientId evicts old ghost ---');
    const clientA2 = io(SERVER_URL);
    await new Promise((resolve) => clientA2.on('connect', resolve));
    const ackA2 = await new Promise((resolve) => {
      clientA2.emit(
        'join',
        { roomId: room, name: 'Alice', clientId: 'tab-alice', audioEnabled: true, videoEnabled: true },
        resolve,
      );
    });
    console.log('Client A2 join ack:', ackA2);
    // Should see Bob, but NOT old Alice ghost
    if (!ackA2.ok || ackA2.peers.some((p) => p.name === 'Alice')) {
      throw new Error('Ghost eviction failed');
    }

    // 5. Room capacity check (max 6)
    console.log('\n--- Test 5: Room capacity check (max 6) ---');
    const extraClients = [];
    for (let i = 3; i <= 6; i++) {
      const c = io(SERVER_URL);
      await new Promise((resolve) => c.on('connect', resolve));
      const ack = await new Promise((resolve) => {
        c.emit('join', { roomId: room, name: `User ${i}` }, resolve);
      });
      extraClients.push(c);
      if (!ack.ok) throw new Error(`User ${i} failed to join`);
    }

    // 7th client should be rejected with room-full
    const client7 = io(SERVER_URL);
    await new Promise((resolve) => client7.on('connect', resolve));
    const ack7 = await new Promise((resolve) => {
      client7.emit('join', { roomId: room, name: 'User 7' }, resolve);
    });
    console.log('Client 7 join ack (expect room-full):', ack7);
    if (ack7.ok || ack7.error !== 'room-full') throw new Error('Room capacity was not enforced');

    // 6. Peer-left on disconnect
    console.log('\n--- Test 6: Peer-left notification on leave ---');
    const leftPromise = new Promise((resolve) => clientB.on('peer-left', resolve));
    clientA2.emit('leave');
    clientA2.disconnect();
    const leftMsg = await leftPromise;
    console.log('Client B received peer-left:', leftMsg);
    if (leftMsg.id !== ackA2.selfId) throw new Error('Wrong peer id in left message');

    // Cleanup extra clients
    clientA.disconnect();
    clientB.disconnect();
    client7.disconnect();
    for (const c of extraClients) c.disconnect();

    console.log('\n🎉 ALL SIGNALING SERVER TESTS PASSED PERFECTLY!\n');
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
