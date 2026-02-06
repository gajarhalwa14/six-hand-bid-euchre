import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from './types';

// Connect to server (proxied or direct)
// If running dev, vite proxies? Or we just point to localhost:3000
const URL = 'http://localhost:3000';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(URL, {
    autoConnect: false
});
