import { useEffect, useState } from 'react';
import type { GameState } from './types';
import { socket } from './socket';
import { Lobby } from './components/Lobby';
import { GameTable } from './components/GameTable';

function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    socket.on('gameState', (state) => {
      setGameState(state);
      setError(null);
    });

    socket.on('error', (msg) => {
      setError(msg);
      setTimeout(() => setError(null), 3000);
    });

    // Cleanup
    return () => {
      socket.off('gameState');
      socket.off('error');
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
        <Lobby />
      ) : (
        <GameTable gameState={gameState} myId={socket.id || ''} />
      )}
    </div>
  );
}

export default App;
