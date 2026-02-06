import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { Game } from './game/Game';
import { ClientToServerEvents, ServerToClientEvents, GameState, Player } from './types';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Room Storage
const rooms = new Map<string, Game>();

// Helper to broadcast sanitized state
function broadcastState(roomId: string, game: Game) {
    const room = io.to(roomId);
    // tailored state per socket?
    // io.to(roomId).emit... sends same object to all.
    // We need to iterate sockets in room and send custom state.

    // Get all sockets in room
    const inputs = io.sockets.adapter.rooms.get(roomId);
    if (!inputs) return;

    for (const socketId of inputs) {
        const socket = io.sockets.sockets.get(socketId);
        if (!socket) continue;

        // Find player index for this socket
        // We can store socketId mapping in Game, but Game stores player ID.
        // Assuming player.id === socket.id for simplicity?
        // Yes, let's use socket.id as player.id.

        const playerIndex = game.state.players.findIndex(p => p.id === socketId);
        if (playerIndex === -1) {
            // Spectator? Or just send full state masked
            socket.emit('gameState', sanitize(game.state, ''));
        } else {
            socket.emit('gameState', sanitize(game.state, socketId));
        }
    }
}

function sanitize(state: GameState, playerId: string): GameState {
    return {
        ...state,
        players: state.players.map(p => {
            if (p.id === playerId) return p;
            return { ...p, hand: [] }; // Hide other hands
        })
    };
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('joinRoom', (roomId, name) => {
        let game = rooms.get(roomId);
        if (!game) {
            game = new Game(roomId);
            rooms.set(roomId, game);
        }

        try {
            // Check if rejoining? 
            const existing = game.state.players.find(p => p.name === name); // Simple name match for persistence
            if (existing) {
                existing.id = socket.id; // Update socket ID
                existing.isConnected = true;
            } else {
                game.addPlayer(socket.id, name);
            }

            socket.join(roomId);

            // Auto start if full? 
            if (game.state.players.length === 6 && game.state.phase === 'LOBBY') {
                game.start();
            }

            broadcastState(roomId, game);
        } catch (e: any) {
            socket.emit('error', e.message);
        }
    });

    // Generic Action Handler Helper
    const handleAction = (fn: () => void) => {
        // Find room for socket
        // Doing reverse lookup is expensive, maybe client sends roomId? 
        // Or we track it. Room is joined in socket.
        // socket.rooms is Set.
        const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
        if (!roomId) return;

        const game = rooms.get(roomId);
        if (!game) return;

        try {
            const pIndex = game.state.players.findIndex(p => p.id === socket.id);
            if (pIndex === -1) throw new Error("Not a player");

            fn(); // Execute action

            broadcastState(roomId, game);
        } catch (e: any) {
            socket.emit('error', e.message);
        }
    };

    socket.on('bid', (bid) => {
        handleAction(() => {
            const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
            const game = rooms.get(roomId!)!;
            const pIndex = game.state.players.findIndex(p => p.id === socket.id);
            game.handleBid(pIndex, bid);
        });
    });

    socket.on('inputPassBid', () => {
        handleAction(() => {
            const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
            const game = rooms.get(roomId!)!;
            const pIndex = game.state.players.findIndex(p => p.id === socket.id);
            game.handleBid(pIndex, 'PASS');
        });
    });

    socket.on('playCard', (cardId) => {
        handleAction(() => {
            const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
            const game = rooms.get(roomId!)!;
            const pIndex = game.state.players.findIndex(p => p.id === socket.id);
            game.handleCardPlay(pIndex, cardId);
        });
    });

    socket.on('discardCards', (cardIds) => {
        handleAction(() => {
            const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
            const game = rooms.get(roomId!)!;
            const pIndex = game.state.players.findIndex(p => p.id === socket.id);
            game.handleShootDiscard(pIndex, cardIds);
        });
    });

    socket.on('passCard', (cardId) => {
        handleAction(() => {
            const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
            const game = rooms.get(roomId!)!;
            const pIndex = game.state.players.findIndex(p => p.id === socket.id);
            game.handleShootPass(pIndex, cardId);
        });
    });

    socket.on('disconnect', () => {
        // Find what room they were in?
        // Since socket is d/c, we can't look at rooms easily unless we tracked it.
        // But typically we don't allow full removal, just mark d/c.
        console.log("Disconnected", socket.id);
    });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
