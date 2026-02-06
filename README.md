# Six-Hand Bid Euchre

A real-time multiplayer implementation of Six-Hand Bid Euchre.

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
