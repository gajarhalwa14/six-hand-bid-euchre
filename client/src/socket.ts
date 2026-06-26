import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from './types';

const socketUrlFromEnv = import.meta.env.VITE_SOCKET_URL;
const serverUrl = import.meta.env.DEV
    ? (socketUrlFromEnv || `${window.location.protocol}//${window.location.hostname}:3000`)
    : (socketUrlFromEnv || window.location.origin);

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(serverUrl, {
    autoConnect: false
});
