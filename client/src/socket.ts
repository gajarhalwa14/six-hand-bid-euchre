import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from './types';

const serverUrl = import.meta.env.DEV
    ? `${window.location.protocol}//${window.location.hostname}:3000`
    : window.location.origin;

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(serverUrl, {
    autoConnect: false
});
