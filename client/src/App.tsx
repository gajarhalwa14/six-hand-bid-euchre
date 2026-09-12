import { useEffect, useState, useCallback } from 'react';
import {
  Routes,
  Route,
  Navigate,
  Outlet,
  useNavigate,
  useLocation,
  useParams,
  useOutletContext,
} from 'react-router-dom';
import type { GameState } from './types';
import { socket } from './socket';
import { Login } from './components/Login';
import { Lobby } from './components/Lobby';
import { GameTable } from './components/GameTable';
import { LoadingScreen } from './components/LoadingScreen';
import { RoomPage } from './components/RoomPage';
import { ProfilePage } from './components/ProfilePage';
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

type AppUser = { username: string; displayName: string; userId?: string };

export type AppOutletContext = {
  user: AppUser;
  gameState: GameState | null;
  error: string | null;
  onJoin: (
    roomId: string,
    name: string,
    isPrivate: boolean,
    avatarId?: string,
    gameMode?: GameMode,
    asSpectator?: boolean,
  ) => void;
  onLogout: () => void;
  onLeaveRoom: () => void;
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

function LoginRoute({
  onLogin,
}: {
  onLogin: (username: string, displayName: string, userId?: string) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getStoredUser();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';

  if (user) {
    return <Navigate to={from} replace />;
  }

  return (
    <div className="app-dark-bg app-shell">
      <Login
        onLogin={(username, displayName, userId) => {
          onLogin(username, displayName, userId);
          navigate(from, { replace: true });
        }}
      />
    </div>
  );
}

function RequireAuth({ user }: { user: AppUser | null }) {
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

function AuthenticatedShell({
  user,
  gameState,
  error,
  onJoin,
  onLogout,
  onLeaveRoom,
}: AppOutletContext) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!gameState) return;
    const roomPath = `/room/${gameState.roomId}`;
    if (location.pathname !== roomPath && !location.pathname.startsWith(`${roomPath}/`)) {
      navigate(roomPath, { replace: true });
    }
  }, [gameState, location.pathname, navigate]);

  if (gameState) {
    return (
      <div className="app-shell">
        {error && <div className="app-error-toast">{error}</div>}
        <GameTable gameState={gameState} myId={socket.id || ''} onLeave={onLeaveRoom} />
      </div>
    );
  }

  return (
    <div className="app-dark-bg app-shell">
      {error && <div className="app-error-toast">{error}</div>}
      <Outlet context={{ user, gameState, error, onJoin, onLogout, onLeaveRoom } satisfies AppOutletContext} />
    </div>
  );
}

function LobbyRoute() {
  const { user, onJoin, onLogout } = useOutletContext<AppOutletContext>();

  return (
    <Lobby
      onJoin={onJoin}
      defaultName={user.displayName}
      defaultAvatarId={localStorage.getItem('avatarId') || undefined}
      onLogout={onLogout}
    />
  );
}

function RoomRoute({ spectate = false }: { spectate?: boolean }) {
  const { roomId: rawRoomId } = useParams();
  const { user, onJoin } = useOutletContext<AppOutletContext>();
  const roomId = rawRoomId?.trim().toUpperCase() ?? '';

  if (!roomId) {
    return <Navigate to="/" replace />;
  }

  return (
    <RoomPage
      roomId={roomId}
      spectate={spectate}
      defaultName={user.displayName}
      defaultAvatarId={localStorage.getItem('avatarId') || undefined}
      onJoin={onJoin}
    />
  );
}

function App() {
  const [introComplete, setIntroComplete] = useState(false);
  const [user, setUser] = useState<AppUser | null>(getStoredUser);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = useCallback((username: string, displayName: string, userId?: string) => {
    setUser({ username, displayName, userId });
  }, []);

  const handleJoin = useCallback((
    roomId: string,
    name: string,
    isPrivate: boolean,
    avatarId?: string,
    gameMode: GameMode = 'CLASSIC',
    asSpectator: boolean = false,
  ) => {
    saveSession(roomId, name, isPrivate, avatarId, gameMode, asSpectator);
    const path = asSpectator ? `/room/${roomId}/spectate` : `/room/${roomId}`;
    navigate(path);
  }, [navigate]);

  const handleLogout = useCallback(() => {
    clearAuthSession();
    clearSession();
    socket.emit('leaveRoom');
    setUser(null);
    setGameState(null);
    navigate('/login');
  }, [navigate]);

  const handleLeaveRoom = useCallback(() => {
    socket.emit('leaveRoom');
    clearSession();
    setGameState(null);
    navigate('/');
  }, [navigate]);

  useEffect(() => {
    socket.on('gameState', (state) => {
      setGameState(state);
      setError(null);
    });

    socket.on('autoSpectating', (roomId) => {
      const session = getSession();
      if (!session || session.roomId !== roomId) return;

      saveSession(
        session.roomId,
        session.name,
        session.isPrivate,
        session.avatarId,
        session.gameMode || 'CLASSIC',
        true,
      );
      navigate(`/room/${roomId}/spectate`, { replace: true });
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
      socket.off('autoSpectating');
      socket.off('error');
      socket.off('connect');
    };
  }, [navigate]);

  const outletContext: AppOutletContext = {
    user: user!,
    gameState,
    error,
    onJoin: handleJoin,
    onLogout: handleLogout,
    onLeaveRoom: handleLeaveRoom,
  };

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginRoute onLogin={handleLogin} />} />

        <Route element={<RequireAuth user={user} />}>
          <Route element={<AuthenticatedShell {...outletContext} user={user!} />}>
            <Route path="/" element={<LobbyRoute />} />
            <Route path="/room/:roomId" element={<RoomRoute />} />
            <Route path="/room/:roomId/spectate" element={<RoomRoute spectate />} />
            <Route path="/profile/:userId" element={<ProfilePage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {!introComplete && (
        <LoadingScreen onComplete={() => setIntroComplete(true)} />
      )}
    </>
  );
}

export default App;
