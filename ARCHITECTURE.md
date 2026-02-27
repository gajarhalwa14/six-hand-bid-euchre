# Architecture — Six-Hand Bid Euchre

## Overview

This project is a real-time multiplayer card game built with a **client/server** architecture. The server maintains all authoritative game state; clients receive a sanitized view of that state via WebSocket events and send player actions back. Shared type definitions ensure consistency across both ends.

---

## Directory Structure

```
Project 2/
├── client/                  # React + Vite frontend
│   ├── index.html           # HTML entry point
│   ├── vite.config.ts       # Vite dev server & build config
│   ├── tsconfig.app.json    # TypeScript config for app source
│   ├── tsconfig.json        # Root TS config
│   ├── tsconfig.node.json   # TypeScript config for Node (Vite config)
│   ├── eslint.config.js     # ESLint rules
│   ├── package.json         # Client dependencies (React, socket.io-client, etc.)
│   ├── public/              # Static assets served as-is
│   └── src/
│       ├── main.tsx         # React DOM entry point; mounts <App />
│       ├── App.tsx          # Root component; owns gameState & error state, routes Lobby ↔ GameTable
│       ├── App.css          # Global app styles
│       ├── index.css        # CSS reset / base styles
│       ├── socket.ts        # Singleton socket.io-client instance (autoConnect: false)
│       ├── types.ts         # Client-local copy of shared types
│       ├── assets/          # Static image/font assets imported by components
│       └── components/
│           ├── Lobby.tsx    # Room join form; connects socket, emits joinRoom
│           ├── Lobby.css
│           ├── GameTable.tsx # Main game view; renders player seats, current trick, scores, and phase UI
│           ├── GameTable.css
│           ├── Controls.tsx  # Action panel: bid controls, card-pass UI, discard UI, play-card buttons
│           ├── Controls.css
│           ├── Card.tsx      # Single playing card component (displays rank/suit)
│           └── Card.css
│
├── server/                  # Node.js + Express + Socket.IO backend
│   ├── package.json         # Server dependencies (express, socket.io, cors, etc.)
│   ├── tsconfig.json        # TypeScript config for server
│   └── src/
│       ├── index.ts         # Entry point: Express app, Socket.IO server, room map, event handlers
│       ├── types.ts         # Server-local copy of shared types (mirrors shared/)
│       └── game/
│           ├── Game.ts      # Game class: full state machine for one room (bidding → shoot → tricks → scoring)
│           ├── Deck.ts      # Deck class: builds and shuffles a 48-card euchre deck
│           └── CardUtils.ts # Pure helpers: trick-winner determination, effective suit (left bower), etc.
│
└── shared/                  # Types shared between client and server
    ├── types.ts             # Core domain types: Card, Player, GameState, Bid, Trick, socket event interfaces
    └── CardUtils.ts         # Shared card utility functions (mirrored / imported by both sides)
```

---

## Module Descriptions

### `shared/`

The source of truth for domain types used on both client and server.

| File | Purpose |
|---|---|
| `types.ts` | Defines `Card`, `Suit`, `Rank`, `Player`, `GameState`, `Bid`, `Trick`, `Phase`, `TeamId`, `ServerToClientEvents`, `ClientToServerEvents` |
| `CardUtils.ts` | Pure functions for card comparison (e.g. effective suit, left bower logic) shared across environments |

### `server/src/`

| File/Module | Purpose |
|---|---|
| `index.ts` | Bootstraps Express and Socket.IO. Maintains an in-memory `Map<roomId, Game>`. Handles all socket events (`joinRoom`, `bid`, `inputPassBid`, `playCard`, `discardCards`, `passCard`, `disconnect`). Calls `broadcastState()` after every action, which sends each player a sanitized `GameState` (other players' hands are hidden). |
| `types.ts` | Local server copy of shared types. |
| `game/Game.ts` | State machine for a single room. Methods: `addPlayer`, `start`, `nextHand`, `handleBid`, `finalizeBid`, `handleCardPlay`, `resolveTrick`, `scoreHand`, `handleShootDiscard`, `handleShootPass`. Phases: `LOBBY → BIDDING → SHOOT_DISCARD → SHOOT_PASS → TRICK_PLAY → SCORING → GAME_OVER`. |
| `game/Deck.ts` | Creates and shuffles a standard 48-card euchre deck (9–A in four suits, two copies for six-hand). |
| `game/CardUtils.ts` | `determineTrickWinner(trick, trump)` and `getEffectiveSuit(card, trump)` — handles left-bower logic. |

### `client/src/`

| File/Module | Purpose |
|---|---|
| `main.tsx` | Calls `ReactDOM.createRoot` and renders `<App />`. |
| `App.tsx` | Owns top-level `gameState` and `error` state. Listens to `socket` events `gameState` and `error`. Renders `<Lobby />` when no state exists, `<GameTable />` otherwise. |
| `socket.ts` | Exports a typed `socket.io-client` singleton pointed at `http://localhost:3000` with `autoConnect: false`. |
| `types.ts` | Client-side mirror of `shared/types.ts`. |
| `components/Lobby.tsx` | Name + Room ID form. On submit: connects the socket, emits `joinRoom`. |
| `components/GameTable.tsx` | Renders the full game board: all six player seats (with position calculated around the table), current trick cards, score display, bidding history, and phase labels. Passes callbacks to `<Controls />`. |
| `components/Controls.tsx` | Context-aware action panel. Renders bid UI (suit/type/amount selectors + Pass) during `BIDDING`, discard UI during `SHOOT_DISCARD`, pass-card UI during `SHOOT_PASS`, and the playable hand during `TRICK_PLAY`. |
| `components/Card.tsx` | Renders a single card (rank + suit symbol, coloured by suit). |

---

## Data Flow

```
User Action (e.g. play a card)
       │
       ▼
Controls.tsx  ──emit('playCard', cardId)──▶  socket.io  ──▶  server/index.ts
                                                                     │
                                                              game.handleCardPlay()
                                                                     │
                                                              broadcastState()
                                                                     │
                                             socket.io  ◀──  emit('gameState', sanitizedState)
       │
       ▼
App.tsx  setGameState(state)
       │
       ▼
GameTable.tsx + Controls.tsx  re-render with new state
```

---

## Game Phases

| Phase | Description |
|---|---|
| `LOBBY` | Waiting for 6 players to join. Game auto-starts when full. |
| `BIDDING` | Each player bids or passes in turn. Highest bid wins. |
| `SHOOT_DISCARD` | If the winning bid is a "Shoot", the shooter discards down to the correct hand size. |
| `SHOOT_PASS` | Shooter's teammates each pass one card to the shooter, then sit out. |
| `TRICK_PLAY` | Standard trick-taking play. Lead player leads; others must follow suit. |
| `SCORING` | Tricks counted; points awarded or subtracted (euchre). Loops to next hand. |
| `GAME_OVER` | A team has reached the winning score threshold. |

---

## Key Design Decisions

- **State authority on server**: Clients never mutate state locally; they only send events and re-render from server broadcasts.
- **Per-player sanitization**: `broadcastState()` iterates each socket individually and strips other players' hands before emitting, preventing card data leakage.
- **Reconnection by name**: If a player reconnects with the same display name, their socket ID is updated and they resume their seat.
- **Shared types via `shared/`**: Both client and server maintain local copies of `types.ts` (rather than a monorepo import), keeping builds simple for a course project.
