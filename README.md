# Six-Hand Bid Euchre 🃏

A real-time multiplayer implementation of Six-Hand Bid Euchre with a modern web interface. Play with 6 players across the internet with synchronized gameplay, bidding system, and complete scoring.

## Features ✨

- **Real-time Multiplayer**: WebSocket-based synchronized gameplay for 6 players
- **Complete Bidding System**: Standard bids (3-8), Shoot (9), and Loner (10) with proper mechanics
- **Smart Card Play**: Visual indicators for valid plays, trick winners, and team distinction
- **Live Game State**: See current bids, tricks taken, scores, and trump suit in real-time
- **Lobby System**: Create or join rooms with unique room codes
- **Responsive UI**: Modern, card-game inspired interface that works on desktop and mobile
- **Native iOS App**: The same client can be wrapped with [Capacitor](https://capacitorjs.com/)
  for App Store distribution — see [iOS App](#ios-app-) below.

## Tech Stack 🛠️

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express + Socket.io
- **Styling**: Vanilla CSS with modern design patterns
- **Real-time Communication**: Socket.io for bidirectional event-based communication

## Requirements
- Node.js (v18+)
- NPM

## Installation

1. **Install Dependencies**
   ```bash
   # Server
   cd server
   npm install
   
   # Client
   cd ../client
   npm install
   ```

## Running Locally

1. **Start the Server**
   ```bash
   cd server
   npx nodemon src/index.ts
   ```

2. **Start the Client**
   ```bash
   cd client
   npm run dev
   ```

3. **Open Browser**
   - Go to `http://localhost:5173` (Vite default).
   - Open 6 tabs to simulate a full game.
   - Join with different names but same Room Code.

## Playing Over the Internet

To play with friends on different networks, use [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) to expose your local server with a public URL. No account or credit card required.

### Setup (one-time)
```bash
brew install cloudflared
```

### Start the game
1. **Kill any old server on port 3000** (if you get `EADDRINUSE`):
   ```bash
   lsof -ti:3000 | xargs kill -9
   ```

2. **Start the server** (Terminal 1):
   ```bash
   cd server
   npx nodemon src/index.ts
   ```

3. **Start the tunnel** (Terminal 2):
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

3. **Copy the public URL** from the tunnel output — look for a line like:
   ```
   INF |  https://random-words-here.trycloudflare.com
   ```

4. **Share that URL** with your friends. Everyone opens it in their browser, creates or joins a room, and plays.

> The URL changes every time you restart the tunnel. Your laptop must stay on while playing.

### Debug Rooms
Visit `/debug/rooms` on your public URL to see all active rooms and connected players:
```
https://random-words-here.trycloudflare.com/debug/rooms
```

## Deployment

### Production Build
1. Build the client:
   ```bash
   cd client
   npm run build
   ```
   This creates a `dist` folder.

2. Build the server:
   ```bash
   cd server
   npx tsc
   ```
   This creates a `dist` folder.

3. Serve:
   - Configure the server to serve `client/dist` as static files.
   - START command: `node server/dist/index.js`

## iOS App 📱

The same React client can be wrapped as a native iOS app using
[Capacitor](https://capacitorjs.com/). The server is unchanged — the iOS
app simply connects to your deployed game server over WebSocket, the
same as the website.

> **The Node server doesn't need to know whether the client is a browser
> or an iOS app.** Socket.io traffic is identical and CORS is already
> wide-open in `server/src/index.ts`.

### One-time prerequisites
- **macOS** with **Xcode 15+** installed (`xcode-select --install`)
- **CocoaPods**: `sudo gem install cocoapods` (or `brew install cocoapods`)
- An **Apple Developer account** ($99/year) if you want to distribute
  via TestFlight or the App Store. You can run on the Simulator without one.

### First-time iOS setup
```bash
cd client

# 1. Install deps (Capacitor is already in package.json)
npm install

# 2. Generate the native iOS project under client/ios/
npm run ios:add

# 3. Configure the server URL for the iOS build.
#    The bundled app cannot infer the server from window.location, so this
#    MUST be set or the iOS app will fail to connect.
cp .env.example .env.production
# then edit .env.production and set VITE_SERVER_URL=https://your-server.example.com

# 4. Build the web app, copy it into the iOS shell, and open Xcode
npm run ios:build-and-open
```

When Xcode opens, choose a simulator (e.g. iPhone 15) and hit ▶ to run.

### Day-to-day iOS workflow
Every time you change client code and want to test on iOS:
```bash
cd client
npm run ios:sync     # vite build + cap sync ios
npm run ios:open     # opens Xcode (or use 'ios:run' to run in simulator from CLI)
```

### Hosting requirements
For an iOS build you need a **publicly reachable HTTPS** server URL — the
Cloudflare Tunnel workflow above is great for the website but unsuitable
for the App Store because the URL changes on every restart and Apple's
App Transport Security blocks plain HTTP by default.

This repo already includes a `render.yaml` for deploying to
[Render](https://render.com) with one click. Other good options:
[Railway](https://railway.app), [Fly.io](https://fly.io), or any VPS
with a reverse-proxy + TLS cert.

### App Store release (high level)
1. Open `client/ios/App/App.xcworkspace` in Xcode.
2. In the **Signing & Capabilities** tab, pick your Apple Developer team.
3. Set the bundle identifier (already `com.naitikrambhia.sixhandbid` in
   `capacitor.config.ts` — change before first release if you want).
4. Add app icons under `App/App/Assets.xcassets/AppIcon.appiconset` and
   a launch screen.
5. **Product → Archive**, then upload to App Store Connect.
6. Submit for review. Apple typically reviews multiplayer card games
   without issue, but be ready to provide demo credentials and a privacy
   policy URL.

### What about Android?
Once iOS is working, Android is essentially `npx cap add android` + open
in Android Studio. Same web code, same server, no other changes.

## Game Rules
- **Players**: 6 (2 teams of 3).
- **Deck**: Double Euchre (9-A x2).
- **Bidding**:
  - 3, 4, 5, 6, 7, 8: Normal bids (Suit, High, Low).
  - Shoot (9): Bidder discards 2, partners pass 1 each. Score +12/-12.
  - Alone (10): Bidder plays alone with 8 cards. Partners sit out. Score +24/-24.
- **Scoring**:
  - Make bid: Score tricks taken (Normal). Shoot: +12. Alone: +24.
  - Fail bid: Subtract bid amount (Shoot -12, Alone -24).
  - Opponents: Always score tricks taken.
  - Game Value: 32 Points.
- **Ranking**:
  - Suit: Right Bower > Left Bower > A > K > Q > J > 10 > 9.
  - High: A > K > Q > J > 10 > 9.
  - Low: 9 > 10 > J > Q > K > A (Inverted).
  - Duplicate Cards: First played wins.
