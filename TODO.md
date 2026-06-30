# TODO — Six-Hand Bid Euchre

Items are grouped by area and ordered roughly by dependency (server-side first, then client).
Legend: `[ ]` not started · `[/]` in progress · `[x]` done

---

## Bug Fixes/Priority Features
- [/] **Alignment issues in UI, not responsive to different screen sizes**
- [x] **Get rid of lobbies if there are no active players in the lobby**
- [ ] **Prevent users from creating lobbies by typing in random codes in the join private lobby section**
- [ ] **Add confirmation button for passing**
- [ ] **Fix appearance of cards at lower screen sizes**
- [ ] **Add indicator for player in lead for each round**
- [/] **Make it more apparent visually which team you are on and who your teammates are**
- [ ] **Add premoves**
- [ ] **Grey out cards that you are unable to play**
- [ ] **Make it more obvious who played what card - maybe add a light color to each card played that represents the team color**
- [ ] **Add pass icons during bidding phase**
- [ ] **Fix UI alignment bugs relating to the dealer, bidder tags below players**
- [ ] **Make it more obvious what suit a player is shooting in**
- [ ] **Make it easier to distinguish between spades and clubs cards**
- [ ] **Show which team bid the contract more clearly, right now only way to tell is to see what team the bidder is on**

---

## Features to Add

- [/] **TRAM**
- [ ] **Add history for the game - what the contract was for each round, which team + player bid the contract, who won the round, score of the round**
- [ ] **Add number of tricks won by each player**
- [ ] **Revamp card art**
- [ ] **Settings/Profile page with stats (involves backend stuff)**
- [ ] **Actually implement public lobbies**

## Lobby System

- [x] **Public / Private room flag** — extend `GameState` with `isPrivate: boolean`
- [x] **Random matchmaking** — server endpoint/event to auto-assign a player to any public room with open seats
- [x] **Room code display** — show the room code prominently in the lobby UI for private rooms (only visible to players in the room)
- [x] **Seat selection for private lobbies** — let players drag/click to choose a specific seat before the game starts; include a "Randomize Seats" button
- [x] **Random seat assignment for public lobbies** — server assigns seats randomly when a player joins a public room
- [ ] **Join-in-progress** — allow a player to join a room that is already in `BIDDING` or `TRICK_PLAY` if an empty/bot seat exists
- [ ] **Host concept** — track which player created the room; host has ability to kick players and start manually

---

## Bot (AI) Players

- [x] **Bot player type** — add `isBot: boolean` to the `Player` type
- [x] **Bot placeholder on join** — when a room starts with fewer than 6 humans, fill remaining seats with bots
- [x] **Bot action loop** — server-side timer/logic that fires a bot action (bid, play card, pass, discard) when it is a bot's turn
- [x] **Bot bidding strategy** — simple heuristic (e.g., bid based on hand strength; pass otherwise)
- [x] **Bot card-play strategy** — follow-suit when required; play highest or lowest card based on trick context
- [x] **Bot shoot/pass logic** — bots handle `SHOOT_DISCARD` and `SHOOT_PASS` phases automatically
- [ ] **Bot takeover on disconnect** — when a human disconnects mid-game, mark their seat as bot-controlled until they rejoin
- [ ] **Bot release on rejoin** — when a player reconnects and their seat is still held (or held by a bot), restore them as human

---

## Game Rules — Missing / Incorrect Implementations

- [ ] **Alone (Loner) bid** — bid value `10`; bidder gets 8 cards (receives both partners' cards?), partners sit out; scoring: `+24 / -24`
- [ ] **Shoot bid scoring** — verify server scores `+12 / -12`, not tricks taken
- [ ] **Alone bid scoring** — server scores `+24 / -24`
- [ ] **Normal bid scoring** — confirm: declarer team scores *tricks taken* on success; loses *bid amount* on failure; opponents always score their tricks taken
- [ ] **Game-over threshold** — end game when a team reaches **32 points** (currently unclear if enforced)
- [ ] **High bid type** — no trump; `A > K > Q > J > 10 > 9` across all suits; first played wins ties (duplicate cards)
- [ ] **Low bid type** — no trump; inverted rank `9 > 10 > J > Q > K > A`; first played wins ties
- [ ] **Duplicate card tie-breaking** — when two identical cards are played, first played wins (`CardUtils.determineTrickWinner`)
- [ ] **All-pass hand** — define behavior when all 6 players pass (re-deal, or dealer is forced to bid)

---

## Server — Infrastructure

- [ ] **Persistent room storage** — currently rooms are in-memory (`Map`); they disappear on server restart; consider a simple JSON/Redis store for persistence across restarts
- [x] **Room cleanup** — garbage-collect rooms that have been empty or idle for a configurable timeout
- [ ] **Player disconnect tracking** — store `roomId` per socket so disconnect handler can mark player as disconnected and trigger bot takeover
- [x] **Public room listing event** — `ServerToClientEvents.roomList` so the lobby can show available public rooms
- [ ] **`joinRandomRoom` event** — server picks the best available public room and auto-joins the player
- [ ] **`createRoom` event** — explicit room creation with `isPrivate` flag, rather than implicit creation on `joinRoom`
- [ ] **Seat-choice event** — `ClientToServerEvents.chooseSeat(seatIndex)` for private lobby seat selection
- [ ] **Kick player event** — `ClientToServerEvents.kickPlayer(playerId)` available to host only

---

## Client — Lobby UI

- [x] **Landing screen** — options: *Join Random Game*, *Create Private Room*, *Join with Code*
- [x] **Public room browser** — list of 5 open public rooms with player count; click to join
- [ ] **Room code input** — text field to enter a private room code and join
- [ ] **Private lobby waiting room** — show connected players, open seats, room code, and a "Start Game" button (host only)
- [ ] **Seat picker UI** — interactive seat diagram for private lobbies; click a seat to claim it
- [ ] **Bot seat indicator** — visually distinguish bot seats from empty/human seats in the lobby

---

## Client — In-Game UI

- [ ] **Alone bid option** — add "Alone" as a selectable bid type in `Controls.tsx` (bid amount fixed at `10`)
- [ ] **Sitting-out indicator** — grey out / badge partners who are sitting out during Shoot or Alone hands
- [ ] **Trick score tracker** — display running trick counts per team during `TRICK_PLAY` (partially implemented per previous conversations; verify correctness)
- [ ] **Per-player bid display** — show each player's bid (or "Pass") during `BIDDING` phase (partially done; verify)
- [ ] **End-of-hand summary** — modal/overlay showing tricks taken, bid result, and points awarded before moving to next hand
- [ ] **Game-over screen** — show winning team, final scores, and a "Play Again" / "Return to Lobby" button
- [ ] **Error toast** — ensure server error messages surface cleanly (basic version exists in `App.tsx`; needs styling)
- [ ] **Responsive layout** — `GameTable.css` needs media queries for smaller screens

---

## Code Quality & Shared Types

- [ ] **Unify `types.ts`** — `shared/types.ts`, `server/src/types.ts`, and `client/src/types.ts` are currently duplicated; set up a monorepo workspace or symlink so there is a single source of truth
- [ ] **`isBot` field on `Player`** — add to shared types when bots are implemented
- [ ] **`isPrivate` / `hostId` fields on `GameState`** — add to shared types when lobby system is extended
- [ ] **`roomList` / `createRoom` socket events** — add to `ServerToClientEvents` / `ClientToServerEvents` interfaces
- [ ] **Alone phase** — add `'ALONE_PASS'` or handle within `SHOOT_PASS` with a flag in `GameState`

---

## Testing & Deployment

- [ ] **Unit tests for `Game.ts`** — cover bid resolution, trick winner, scoring edge cases (euchre, shoot, alone)
- [ ] **Unit tests for `CardUtils.ts`** — left bower, High/Low rankings, duplicate card rule
- [ ] **Integration smoke test** — spin up server, simulate 6 socket clients through a full hand
- [ ] **Environment config** — move hard-coded `http://localhost:3000` in `socket.ts` to a `.env` variable (`VITE_SERVER_URL`)
- [ ] **Production build pipeline** — confirm `client/dist` is served by Express in production (`app.use(express.static(...))`)
- [ ] **Choose hosting provider** — select a platform (e.g., Render, Railway, Fly.io, or Heroku) that supports Node.js and WebSockets
- [ ] **Deploy server & client** — push code to the hosting provider, set up environment variables, and configure build commands
- [ ] **Custom domain & SSL** — configure a custom domain name and ensure HTTPS/WSS is enabled so players can connect securely
- [ ] **Deployment docs** — update `README.md` with hosting instructions (e.g., Railway, Render, or Fly.io for the server; Vercel/Netlify for the client)
