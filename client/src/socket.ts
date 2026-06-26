import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from './types';

/**
 * Resolve the game server URL.
 *
 * Priority (highest first):
 *   1. `VITE_SERVER_URL` env var baked in at build time.
 *      This is what the iOS / Capacitor build uses — the bundled web
 *      app lives at `capacitor://localhost`, which is NOT the server,
 *      so we must point it explicitly at the deployed game backend.
 *      Set it in `client/.env.production` (or via the build command):
 *          VITE_SERVER_URL=https://your-server.example.com npm run build
 *
 *   2. Dev mode in the browser: same host, port 3000 (matches the
 *      Vite dev workflow described in README.md).
 *
 *   3. Web prod (the Node server serves the SPA at the same origin) —
 *      use the page's own origin.
 *
 * `capacitor://localhost` would otherwise fall into the prod branch,
 * which is why the env var must take precedence.
 */
function resolveServerUrl(): string {
    const envUrl = import.meta.env.VITE_SERVER_URL as string | undefined;
    if (envUrl && envUrl.trim().length > 0) {
        return envUrl.trim();
    }

    // If we're running inside a Capacitor/iOS shell without a configured
    // server URL, surface a loud console error so it's immediately obvious
    // why the app can't connect.
    if (typeof window !== 'undefined' && window.location.protocol === 'capacitor:') {
        console.error(
            '[socket] Running inside Capacitor but VITE_SERVER_URL is not set. ' +
            'Build the client with VITE_SERVER_URL=<your server URL> before running cap sync.'
        );
    }

    if (import.meta.env.DEV) {
        return `${window.location.protocol}//${window.location.hostname}:3000`;
    }
    return window.location.origin;
}

const serverUrl = resolveServerUrl();

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(serverUrl, {
    autoConnect: false,
    // Be tolerant of mobile networks: prefer WebSocket but fall back to
    // long-polling, and reconnect on flaky connections.
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
});
