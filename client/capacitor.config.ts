import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for wrapping the React/Vite build into a native
 * iOS (and optionally Android) app.
 *
 * - `appId` becomes the iOS bundle identifier. The reverse-DNS form is
 *   conventional. Once your app ships to TestFlight or the App Store you
 *   should NOT change it.
 * - `webDir` is the folder containing the built site that gets bundled
 *   into the native shell. `vite build` writes here by default.
 * - `server.androidScheme` is set to https so iOS-style URLs are consistent
 *   across platforms when we later add Android.
 *
 * The actual game server URL is NOT configured here — it's set at build
 * time via `VITE_SOCKET_URL` (and `VITE_API_BASE_URL` for the FastAPI
 * auth backend) and read in `src/socket.ts` / `src/api.ts`. That keeps
 * dev/prod/iOS/web all using the same code path.
 */
const config: CapacitorConfig = {
    appId: 'com.naitikrambhia.sixhandbid',
    appName: 'Six-Hand Bid Euchre',
    webDir: 'dist',
    ios: {
        // Allow the WKWebView to scroll & gesture naturally.
        contentInset: 'always',
        // Status bar background matches our dark theme so the notch area
        // doesn't show a white strip on first paint.
        backgroundColor: '#0f4a1a',
    },
    server: {
        // For local development against a Mac running `npm run dev`, you can
        // temporarily point Capacitor at the dev server by setting
        // `CAPACITOR_LIVE_RELOAD=1` and running `npm run ios:dev` — see scripts.
        // In production this stays undefined and the bundled `dist/` is used.
        androidScheme: 'https',
    },
};

export default config;
