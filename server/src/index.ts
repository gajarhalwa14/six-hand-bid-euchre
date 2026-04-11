import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { Game } from './game/Game';
import { ClientToServerEvents, ServerToClientEvents, GameState, Player, RoomInfo } from './types';

const app = express();
app.use(cors());

const clientDistPath = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

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

    socket.on('joinRoom', (roomId, name, isPrivate) => {
        let game = rooms.get(roomId);
        const isNewRoom = !game;
        if (!game) {
            game = new Game(roomId, isPrivate ?? false);
            game.onStateChange = () => broadcastState(roomId, game!);
            rooms.set(roomId, game);
        }

        try {
            const existing = game.state.players.find(p => p.name === name);
            if (existing) {
                existing.id = socket.id;
                existing.isConnected = true;
                console.log(`[${roomId}] Player "${name}" rejoined (socket ${socket.id}). Players: ${game.state.players.length}`);
            } else {
                game.addPlayer(socket.id, name);
                console.log(`[${roomId}] Player "${name}" joined ${isNewRoom ? '(NEW room)' : '(existing room)'}. Players: ${game.state.players.length}`);
            }
            game.markActivity();

            socket.join(roomId);

            if (!game.state.isPrivate && game.state.phase === 'LOBBY') {
                game.start();
            }

            broadcastState(roomId, game);
        } catch (e: any) {
            socket.emit('error', e.message);
        }
    });

    socket.on('joinRandomRoom', (name) => {
        // Find a public, LOBBY-phase room with open seats
        let targetRoomId: string | null = null;
        for (const [id, game] of rooms) {
            if (!game.state.isPrivate && game.state.phase === 'LOBBY' && game.state.players.length < 6) {
                targetRoomId = id;
                break;
            }
        }

        // No matching room — create a fresh public one with a random 6-char code
        if (!targetRoomId) {
            targetRoomId = Math.random().toString(36).slice(2, 8).toUpperCase();
            const newGame = new Game(targetRoomId, false);
            newGame.onStateChange = () => broadcastState(targetRoomId!, newGame);
            rooms.set(targetRoomId, newGame);
        }

        const game = rooms.get(targetRoomId)!;

        try {
            const existing = game.state.players.find(p => p.name === name);
            if (existing) {
                existing.id = socket.id; // Update socket ID
                existing.isConnected = true;
            } else {
                game.addPlayer(socket.id, name);
            }
            game.markActivity();

            socket.join(targetRoomId);

            // Tell the client which room they were placed in
            socket.emit('roomJoined', targetRoomId);

            // Auto start immediately for public rooms, bots will fill the rest
            if (!game.state.isPrivate && game.state.phase === 'LOBBY') {
                game.start();
            }

            broadcastState(targetRoomId, game);
        } catch (e: any) {
            socket.emit('error', e.message);
        }
    });

    socket.on('requestRoomList', () => {
        const publicRooms: RoomInfo[] = [];
        for (const [id, game] of rooms) {
            if (!game.state.isPrivate && game.state.phase === 'LOBBY' && game.state.players.length < 6) {
                publicRooms.push({
                    roomId: id,
                    playerCount: game.state.players.filter(p => p !== null).length // Assuming players array can have nulls or length just works
                });
                if (publicRooms.length >= 5) break;
            }
        }
        socket.emit('roomList', publicRooms);
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

            game.markActivity();
            fn(); // Execute action

            broadcastState(roomId, game);
        } catch (e: any) {
            socket.emit('error', e.message);
        }
    };

    socket.on('chooseSeat', (seatIndex) => {
        handleAction(() => {
            const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
            const game = rooms.get(roomId!)!;
            game.handleChooseSeat(socket.id, seatIndex);
        });
    });

    socket.on('randomizeSeats', () => {
        handleAction(() => {
            const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
            const game = rooms.get(roomId!)!;
            game.handleRandomizeSeats(socket.id);
        });
    });

    socket.on('startGame', () => {
        handleAction(() => {
            const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
            const game = rooms.get(roomId!)!;
            if (game.state.isPrivate && game.state.hostId === socket.id && game.state.phase === 'LOBBY') {
                game.start();
            }
        });
    });

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

    socket.on('leaveRoom', () => {
        const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
        if (!roomId) return;

        const game = rooms.get(roomId);
        if (game) {
            const pIndex = game.state.players.findIndex(p => p.id === socket.id);
            if (pIndex !== -1) {
                const player = game.state.players[pIndex];
                player.isConnected = false;
                if (game.state.phase !== 'LOBBY') {
                    player.isBot = true;
                    player.name = `Bot ${['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'][player.seatIndex ?? pIndex]}`;
                    player.id = `bot-${Math.random().toString(36).substr(2, 6)}`;
                    game.triggerBotTurnIfNeeded();
                } else {
                    game.state.players.splice(pIndex, 1);
                }
                if (game.state.hostId === socket.id && game.state.players.length > 0) {
                    const nextHuman = game.state.players.find(p => !p.isBot);
                    game.state.hostId = nextHuman?.id ?? game.state.players[0].id;
                }
                broadcastState(roomId, game);
            }
        }
        socket.leave(roomId);
    });

    socket.on('requestSeatSwap', (targetPlayerIndex) => {
        const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
        if (!roomId) return;
        const game = rooms.get(roomId);
        if (!game) return;

        const requestorIndex = game.state.players.findIndex(p => p.id === socket.id);
        if (requestorIndex === -1) return;

        const result = game.handleSeatSwap(requestorIndex, targetPlayerIndex);
        if (!result.valid) {
            socket.emit('error', result.error!);
            return;
        }

        const target = game.state.players[targetPlayerIndex];
        const targetSocket = io.sockets.sockets.get(target.id);
        if (!targetSocket) {
            socket.emit('error', 'Target player is not connected');
            return;
        }

        targetSocket.emit('seatSwapOffer', {
            fromPlayerIndex: requestorIndex,
            fromPlayerName: game.state.players[requestorIndex].name,
            toPlayerIndex: targetPlayerIndex
        });
        socket.emit('seatSwapResult', `Swap request sent to ${target.name}`);
    });

    socket.on('respondSeatSwap', (fromPlayerIndex, accepted) => {
        const roomId = Array.from(socket.rooms).find(r => r !== socket.id);
        if (!roomId) return;
        const game = rooms.get(roomId);
        if (!game) return;

        const myIndex = game.state.players.findIndex(p => p.id === socket.id);
        if (myIndex === -1) return;

        const fromPlayer = game.state.players[fromPlayerIndex];
        if (!fromPlayer) return;
        const fromSocket = io.sockets.sockets.get(fromPlayer.id);

        if (!accepted) {
            if (fromSocket) fromSocket.emit('seatSwapResult', `${game.state.players[myIndex].name} declined your swap request`);
            return;
        }

        game.executeSeatSwap(fromPlayerIndex, myIndex);
        if (fromSocket) fromSocket.emit('seatSwapResult', `Seat swap with ${game.state.players[myIndex].name} accepted!`);
        socket.emit('seatSwapResult', `Seat swap with ${fromPlayer.name} accepted!`);
        broadcastState(roomId, game);
    });

    socket.on('disconnect', () => {
        console.log("Disconnected", socket.id);
    });
});

// --- Room Garbage Collection ---
setInterval(() => {
    const now = Date.now();
    for (const [roomId, game] of rooms.entries()) {
        const idleTime = now - game.lastActivityTime;
        const hasHumans = game.state.players.some(p => !p.isBot); // simplified check for now

        // Remove if absolutely no activity for 2 hours, OR empty of humans for 10 minutes
        if (idleTime > 2 * 60 * 60 * 1000 || (!hasHumans && idleTime > 10 * 60 * 1000)) {
            console.log(`Garbage collecting idle room: ${roomId}`);
            rooms.delete(roomId);
        }
    }
}, 60 * 1000); // Check every minute

app.get('/debug/rooms', (_req, res) => {
    const data = Array.from(rooms.entries()).map(([roomId, game]) => {
        const socketRoom = io.sockets.adapter.rooms.get(roomId);
        return {
            roomId,
            isPrivate: game.state.isPrivate,
            phase: game.state.phase,
            hostId: game.state.hostId,
            playerCount: game.state.players.length,
            connectedSockets: socketRoom ? socketRoom.size : 0,
            idleSeconds: Math.round((Date.now() - game.lastActivityTime) / 1000),
            players: game.state.players.map(p => ({
                name: p.name,
                id: p.id,
                team: p.team,
                seat: p.seatIndex,
                isBot: p.isBot,
                isConnected: p.isConnected,
                socketInRoom: socketRoom ? socketRoom.has(p.id) : false
            }))
        };
    });

    res.json({
        totalRooms: rooms.size,
        totalConnectedSockets: io.sockets.sockets.size,
        rooms: data
    });
});

app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
httpServer.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} (listening on all interfaces)`);
});
