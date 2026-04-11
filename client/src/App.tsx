import { useEffect, useState, useCallback } from 'react';
import type { GameState } from './types';
import { socket } from './socket';
import { Lobby } from './components/Lobby';
import { GameTable } from './components/GameTable';

function saveSession(roomId: string, name: string, isPrivate: boolean) {
  sessionStorage.setItem('euchre_session', JSON.stringify({ roomId, name, isPrivate }));
}

function clearSession() {
  sessionStorage.removeItem('euchre_session');
}

function getSession(): { roomId: string; name: string; isPrivate: boolean } | null {
  try {
    const raw = sessionStorage.getItem('euchre_session');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLeaveRoom = useCallback(() => {
    socket.emit('leaveRoom');
    clearSession();
    setGameState(null);
  }, []);

  useEffect(() => {
    socket.on('gameState', (state) => {
      setGameState(state);
      setError(null);
    });

    socket.on('error', (msg) => {
      setError(msg);
      setTimeout(() => setError(null), 3000);
    });

    socket.on('connect', () => {
      const session = getSession();
      if (session) {
        socket.emit('joinRoom', session.roomId, session.name, session.isPrivate);
      }
    });

    return () => {
      socket.off('gameState');
      socket.off('error');
      socket.off('connect');
    };
  }, []);

  return (
    <div className="app">
      {error && <div style={{
        position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
        background: 'red', padding: '10px', color: 'white', zIndex: 9999
      }}>
        {error}
      </div>}

      {!gameState ? (
        <Lobby onJoin={saveSession} />
      ) : (
        <GameTable gameState={gameState} myId={socket.id || ''} onLeave={handleLeaveRoom} />
      )}
    </div>
  );
}

export default App;
