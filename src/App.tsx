import { useCallback, useEffect, useState } from 'react';
import type { FacingMode } from './types';
import { CallEngine } from './lib/CallEngine';
import { Lobby } from './components/Lobby';
import { Room } from './components/Room';

function getRoomFromPath(): string | null {
  const match = window.location.pathname.match(/\/r\/([a-z0-9-]+)/i);
  return match ? match[1].toLowerCase() : null;
}

export function App() {
  const [initialRoomId, setInitialRoomId] = useState<string | null>(() => getRoomFromPath());
  const [engine, setEngine] = useState<CallEngine | null>(null);

  // Handle browser back/forward buttons
  useEffect(() => {
    const onPopState = () => {
      const room = getRoomFromPath();
      setInitialRoomId(room);
      if (!room && engine) {
        engine.leave();
        setEngine(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [engine]);

  const handleJoin = useCallback(
    ({
      roomId,
      name,
      audioTrack,
      videoTrack,
      audioEnabled,
      videoEnabled,
      facingMode,
    }: {
      roomId: string;
      name: string;
      audioTrack: MediaStreamTrack | null;
      videoTrack: MediaStreamTrack | null;
      audioEnabled: boolean;
      videoEnabled: boolean;
      facingMode: FacingMode;
    }) => {
      // Update browser URL to /r/:roomId without full page reload
      const targetPath = `/r/${roomId}`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState(null, '', targetPath);
      }

      const newEngine = new CallEngine({
        roomId,
        name,
        audioTrack,
        videoTrack,
        audioEnabled,
        videoEnabled,
        facingMode,
      });

      newEngine.start();
      setEngine(newEngine);
    },
    [],
  );

  const handleLeave = useCallback(() => {
    setEngine(null);
    if (window.location.pathname !== '/') {
      window.history.pushState(null, '', '/');
    }
    setInitialRoomId(null);
  }, []);

  return (
    <div className="app-container">
      {engine ? (
        <Room engine={engine} onLeave={handleLeave} />
      ) : (
        <Lobby initialRoomId={initialRoomId} onJoin={handleJoin} />
      )}
    </div>
  );
}
export default App;
