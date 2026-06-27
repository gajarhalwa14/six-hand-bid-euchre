import { useEffect, useState, useCallback } from 'react';
import type { GameState } from './types';
import { socket } from './socket';
import { Login } from './components/Login';
import { Lobby } from './components/Lobby';
import { GameTable } from './components/GameTable';
import { LoadingScreen } from './components/LoadingScreen';
import type { GameMode } from './types';
import { clearAuthSession, getStoredUser } from './api';

type StoredSession = {
  roomId: string;
  name: string;
  isPrivate: boolean;
  avatarId?: string;
  gameMode?: GameMode;
  asSpectator?: boolean;
};

function saveSession(
  roomId: string,
  name: string,
  isPrivate: boolean,
  avatarId?: string,
  gameMode: GameMode = 'CLASSIC',
  asSpectator: boolean = false,
) {
  const session: StoredSession = { roomId, name, isPrivate, avatarId, gameMode, asSpectator };
  sessionStorage.setItem('euchre_session', JSON.stringify(session));
}

function clearSession() {
  sessionStorage.removeItem('euchre_session');
}

function getSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem('euchre_session');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function App() {
  const [introComplete, setIntroComplete] = useState(false);
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
        if (session.asSpectator) {
          socket.emit('joinAsSpectator', session.roomId, session.name, session.avatarId);
        } else {
          socket.emit('joinRoom', session.roomId, session.name, session.isPrivate, session.avatarId, session.gameMode || 'CLASSIC');
        }
      }
    });

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

  return (
    <>
      {/* Login / lobby sit on the dark spade background. Game table paints its own green felt. */}
      {!user ? (
        <div className="app-dark-bg app-shell">
          <Login onLogin={handleLogin} />
        </div>
      ) : (
        <div className={`app-shell ${!gameState ? 'app-dark-bg' : ''}`}>
          {error && (
            <div className="app-error-toast">{error}</div>
          )}

          {!gameState ? (
            <Lobby
              onJoin={saveSession}
              defaultName={user.displayName}
              defaultAvatarId={localStorage.getItem('avatarId') || undefined}
              onLogout={handleLogout}
            />
          ) : (
            <GameTable gameState={gameState} myId={socket.id || ''} onLeave={handleLeaveRoom} />
          )}
        </div>
      )}

      {/* Intro video sits on top; login is already rendered underneath so the fade
          reveals the login screen instead of a flash of the old green body bg. */}
      {!introComplete && (
        <LoadingScreen onComplete={() => setIntroComplete(true)} />
      )}
    </>
  );
}

export default App;
