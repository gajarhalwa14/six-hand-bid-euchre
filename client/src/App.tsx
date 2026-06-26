import { useEffect, useState, useCallback } from 'react';
import type { GameState } from './types';
import { socket } from './socket';
import { Login } from './components/Login';
import { Lobby } from './components/Lobby';
import { GameTable } from './components/GameTable';
import type { GameMode } from './types';
import { clearAuthSession, getStoredUser } from './api';

function saveSession(roomId: string, name: string, isPrivate: boolean, avatarId?: string, gameMode: GameMode = 'CLASSIC') {
  sessionStorage.setItem('euchre_session', JSON.stringify({ roomId, name, isPrivate, avatarId, gameMode }));
}

function clearSession() {
  sessionStorage.removeItem('euchre_session');
}

function getSession(): { roomId: string; name: string; isPrivate: boolean; avatarId?: string; gameMode?: GameMode } | null {
  try {
    const raw = sessionStorage.getItem('euchre_session');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function App() {
  const [user, setUser] = useState<{ username: string; displayName: string; userId?: string } | null>(getStoredUser);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = useCallback((username: string, displayName: string, userId?: string) => {
    setUser({ username, displayName, userId });
  }, []);

  const handleLogout = useCallback(() => {
    clearAuthSession();
    clearSession();
    socket.emit('leaveRoom');
    setUser(null);
    setGameState(null);
  }, []);

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
        socket.emit('joinRoom', session.roomId, session.name, session.isPrivate, session.avatarId, session.gameMode || 'CLASSIC');
      }
    });

    // Auto-reconnect on page refresh if session + user exist
    const session = getSession();
    const savedUser = getStoredUser();
    if (session && savedUser) {
      socket.connect();
    }

    return () => {
      socket.off('gameState');
      socket.off('error');
      socket.off('connect');
    };
  }, []);

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="app">
      {error && <div style={{
        position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
        background: 'red', padding: '10px', color: 'white', zIndex: 9999
      }}>
        {error}
      </div>}

      {!gameState ? (
        <Lobby onJoin={saveSession} defaultName={user.displayName} defaultAvatarId={localStorage.getItem('avatarId') || undefined} onLogout={handleLogout} />
      ) : (
        <GameTable gameState={gameState} myId={socket.id || ''} onLeave={handleLeaveRoom} />
      )}
    </div>
  );
}

export default App;
