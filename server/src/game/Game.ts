import { GameState, Player, Spectator, Card, Bid, Suit, Phase, Trick, TeamId, SUITS, BidType, GameMode } from '../types';
import { Deck } from './Deck';
import { determineTrickWinner, getEffectiveSuit, getCardValue } from './CardUtils';
import { BotAI } from './BotAI';

export class Game {
    state: GameState;
    private deck: Deck;
    public onStateChange?: () => void;
    private botTimeout?: NodeJS.Timeout;
    public lastActivityTime: number;

    constructor(roomId: string, isPrivate: boolean = false, gameMode: GameMode = 'CLASSIC') {
        this.deck = new Deck();
        this.lastActivityTime = Date.now();
        this.state = {
            roomId,
            gameMode,
            players: [],
            phase: 'LOBBY',
            currentBidderIndex: -1,
            bids: [],
            winningBid: null,
            declarerIndex: null,
            preBidDiscardWaitList: [],
            shootDiscardWaitList: [],
            shootPassWaitList: [],
            currentTrick: { leadSuit: null, plays: [], winnerIndex: null },
            tricksHistory: [],
            turnIndex: -1,
            scores: { A: 0, B: 0 },
            dealerIndex: -1,
            biddingTurnCount: 0,
            trump: null,
            isPrivate,
            hostId: null,
            spectators: [],
            tramClaim: null,
        };
    }

    addSpectator(id: string, name: string, avatarId?: string): Spectator {
        // Replace existing entry by name so reconnects don't pile up.
        const existingByName = this.state.spectators?.findIndex(s => s.name === name) ?? -1;
        const spectator: Spectator = { id, name, avatarId, isConnected: true };
        if (!this.state.spectators) this.state.spectators = [];
        if (existingByName !== -1) {
            this.state.spectators[existingByName] = spectator;
        } else {
            this.state.spectators.push(spectator);
        }
        return spectator;
    }

    removeSpectator(id: string) {
        if (!this.state.spectators) return;
        this.state.spectators = this.state.spectators.filter(s => s.id !== id);
    }

    /**
     * Atomically swap a seated player with a spectator: the spectator takes
     * the player's seat (team + hand + connection), and the original player
     * becomes a spectator. Returns true on success.
     *
     * IMPORTANT: this is intended to be called from inside an offer/response
     * flow gated by `canSwapWithSpectator`.
     */
    executeSpectatorSwap(playerId: string, spectatorId: string): boolean {
        const playerIndex = this.state.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) return false;
        const spectator = this.state.spectators?.find(s => s.id === spectatorId);
        if (!spectator) return false;

        const player = this.state.players[playerIndex];

        // Spectator takes over the seat: keeps the seat's team, hand, and
        // seatIndex. From the game's perspective only the id/name/avatar change.
        const newPlayer: Player = {
            id: spectator.id,
            name: spectator.name,
            team: player.team,
            hand: player.hand,
            isConnected: true,
            seatIndex: player.seatIndex,
            isBot: false,
            avatarId: spectator.avatarId,
        };
        this.state.players[playerIndex] = newPlayer;

        // Remove the old spectator entry, demote the old player to spectator.
        this.removeSpectator(spectator.id);
        this.addSpectator(player.id, player.name, player.avatarId);

        // Host might have just become a spectator — hand the host crown to
        // another seated human if so.
        if (this.state.hostId === player.id) {
            const newHost = this.state.players.find(p => !p.isBot && p.id !== player.id);
            this.state.hostId = newHost?.id ?? newPlayer.id;
        }

        return true;
    }

    /**
     * Validate that a swap can happen. Refuses bots, spectators who are no
     * longer connected, and self-swaps.
     */
    canSwapWithSpectator(playerId: string, spectatorId: string): { ok: boolean; error?: string } {
        const player = this.state.players.find(p => p.id === playerId);
        if (!player) return { ok: false, error: 'You are not in this room' };
        if (player.isBot) return { ok: false, error: 'Bots cannot offer their seat' };
        const spectator = this.state.spectators?.find(s => s.id === spectatorId);
        if (!spectator) return { ok: false, error: 'That spectator has left' };
        if (spectator.id === playerId) return { ok: false, error: 'Cannot swap with yourself' };
        return { ok: true };
    }

    private getPlayerCount(): number {
        return this.state.gameMode === 'MEGA_DRAFT' ? 4 : 6;
    }

    private getCardsPerPlayer(): number {
        return this.state.gameMode === 'MEGA_DRAFT' ? 12 : 8;
    }

    private getShootDiscardCount(): number {
        return this.isOneCardShootBid(this.state.winningBid?.amount) ? 1 : 2;
    }

    private getShootPassCountPerPartner(): number {
        if (this.state.gameMode !== 'MEGA_DRAFT') return 1;
        return this.isOneCardShootBid(this.state.winningBid?.amount) ? 1 : 2;
    }

    private getHandTrickCount(): number {
        return 8;
    }

    private isOneCardShootBid(amount?: number): boolean {
        return this.state.gameMode === 'MEGA_DRAFT' && amount === 10;
    }

    private isShootBid(amount?: number): boolean {
        return amount === 9 || this.isOneCardShootBid(amount);
    }

    private isLonerBid(amount?: number): boolean {
        if (this.state.gameMode === 'MEGA_DRAFT') return amount === 11;
        return amount === 10;
    }

    private getGameOverReached(): boolean {
        if (this.state.gameMode === 'MEGA_DRAFT') {
            return this.state.scores.A >= 50 || this.state.scores.B >= 50 || this.state.scores.A <= -100 || this.state.scores.B <= -100;
        }
        return this.state.scores.A >= 32 || this.state.scores.B >= 32;
    }

    markActivity() {
        this.lastActivityTime = Date.now();
    }

    /**
     * Tear down any pending background work (bot turn timers). Called by the
     * server when a room is being deleted so we don't leave timers running
     * that touch a stale game.
     */
    dispose() {
        if (this.botTimeout) {
            clearTimeout(this.botTimeout);
            this.botTimeout = undefined;
        }
        this.onStateChange = undefined;
    }

    addPlayer(id: string, name: string, avatarId?: string): Player | null {
        if (this.state.players.length >= this.getPlayerCount()) return null;

        let seatIndex: number | undefined;
        if (this.state.isPrivate) {
            // Find first available seat
            const taken = new Set(this.state.players.map(p => p.seatIndex));
            for (let i = 0; i < this.getPlayerCount(); i++) {
                if (!taken.has(i)) {
                    seatIndex = i;
                    break;
                }
            }
            if (!this.state.hostId) {
                this.state.hostId = id; // First player in private room is host
            }
        } else {
            // Public room: random assigning
            const availableSeats = Array.from({ length: this.getPlayerCount() }, (_, i) => i).filter(i =>
                !this.state.players.some(p => p.seatIndex === i)
            );
            if (availableSeats.length > 0) {
                seatIndex = availableSeats[Math.floor(Math.random() * availableSeats.length)];
            } else {
                seatIndex = this.state.players.length; // Fallback
            }
        }

        const team: TeamId = (seatIndex! % 2 === 0) ? 'A' : 'B';

        const player: Player = {
            id, name, team, hand: [], isConnected: true, seatIndex, isBot: false, avatarId
        };
        this.state.players.push(player);
        return player;
    }

    tryJoinInProgress(id: string, name: string): Player | null {
        // Find a bot seat to take over
        const botIndex = this.state.players.findIndex(p => p.isBot);
        if (botIndex === -1) return null; // No bots available

        const bot = this.state.players[botIndex];

        // Replace bot with human
        const player: Player = {
            id,
            name,
            team: bot.team,
            hand: bot.hand, // inherit the bot's hand
            isConnected: true,
            seatIndex: bot.seatIndex,
            isBot: false
        };

        this.state.players[botIndex] = player;
        return player;
    }

    handleChooseSeat(playerId: string, targetSeat: number) {
        if (!this.state.isPrivate || this.state.phase !== 'LOBBY') return;
        if (targetSeat < 0 || targetSeat >= this.getPlayerCount()) return;

        const player = this.state.players.find(p => p.id === playerId);
        if (!player) return;

        const occupier = this.state.players.find(p => p.seatIndex === targetSeat);
        if (occupier) {
            occupier.seatIndex = player.seatIndex;
            occupier.team = (occupier.seatIndex! % 2 === 0) ? 'A' : 'B';
        }

        player.seatIndex = targetSeat;
        player.team = (targetSeat % 2 === 0) ? 'A' : 'B';
    }

    handleSeatSwap(requestorIndex: number, targetIndex: number): { valid: boolean; error?: string } {
        if (this.state.phase === 'LOBBY') return { valid: false, error: "Use seat picker in lobby" };
        if (requestorIndex < 0 || requestorIndex >= this.state.players.length) return { valid: false, error: "Invalid player" };
        if (targetIndex < 0 || targetIndex >= this.state.players.length) return { valid: false, error: "Invalid target" };
        if (requestorIndex === targetIndex) return { valid: false, error: "Can't swap with yourself" };

        const requestor = this.state.players[requestorIndex];
        const target = this.state.players[targetIndex];

        if (requestor.team === target.team) return { valid: false, error: "Can only swap with a player on the other team" };
        if (target.isBot) return { valid: false, error: "Can't swap with a bot" };

        return { valid: true };
    }

    executeSeatSwap(requestorIndex: number, targetIndex: number) {
        const a = this.state.players[requestorIndex];
        const b = this.state.players[targetIndex];

        const tempSeat = a.seatIndex;
        a.seatIndex = b.seatIndex;
        b.seatIndex = tempSeat;

        a.team = (a.seatIndex! % 2 === 0) ? 'A' : 'B';
        b.team = (b.seatIndex! % 2 === 0) ? 'A' : 'B';

        const tempHand = a.hand;
        a.hand = b.hand;
        b.hand = tempHand;

        this.state.players.sort((x, y) => x.seatIndex! - y.seatIndex!);
    }

    handleRandomizeSeats(playerId: string) {
        if (!this.state.isPrivate || this.state.phase !== 'LOBBY' || this.state.hostId !== playerId) return;

        const available = Array.from({ length: this.getPlayerCount() }, (_, i) => i);
        for (let i = available.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [available[i], available[j]] = [available[j], available[i]];
        }

        this.state.players.forEach((p, i) => {
            p.seatIndex = available[i];
            p.team = (p.seatIndex % 2 === 0) ? 'A' : 'B';
        });
    }

    // Start game from Lobby
    start() {
        // Fill empty seats with bots
        const takenSeats = new Set(this.state.players.map(p => p.seatIndex));
        for (let i = 0; i < this.getPlayerCount(); i++) {
            if (!takenSeats.has(i)) {
                const botId = `bot-${Math.random().toString(36).substr(2, 6)}`;
                const botName = `Bot ${['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'][i]}`;
                const team: TeamId = (i % 2 === 0) ? 'A' : 'B';
                this.state.players.push({
                    id: botId,
                    name: botName,
                    team,
                    hand: [],
                    isConnected: true,
                    seatIndex: i,
                    isBot: true
                });
            }
        }

        // Sort players array so index matches seatIndex (important for next-turn logic)
        this.state.players.sort((a, b) => a.seatIndex! - b.seatIndex!);

        this.state.dealerIndex = Math.floor(Math.random() * this.getPlayerCount());
        this.state.scores = { A: 0, B: 0 };
        this.nextHand();
        this.triggerBotTurnIfNeeded();
    }

    private nextHand() {
        this.state.dealerIndex = (this.state.dealerIndex + 1) % this.getPlayerCount();
        this.deck.reset();
        this.deck.shuffle();

        const hands = this.deck.dealInRotatingPairs(this.getPlayerCount(), this.getCardsPerPlayer(), this.state.dealerIndex);
        this.state.players.forEach((p, i) => p.hand = hands[i]);

        this.state.phase = 'DEALING';
        this.state.currentBidderIndex = (this.state.dealerIndex + 1) % this.getPlayerCount();
        this.state.bids = [];
        this.state.biddingTurnCount = 0;
        this.state.winningBid = null;
        this.state.declarerIndex = null;
        this.state.trump = null;
        this.state.tramClaim = null;

        this.state.currentTrick = { leadSuit: null, plays: [], winnerIndex: null };
        this.state.tricksHistory = [];

        this.onStateChange?.();

        // Deal animation then move to setup phase
        setTimeout(() => {
            if (this.state.gameMode === 'MEGA_DRAFT') {
                this.state.phase = 'PRE_BID_DISCARD';
                this.state.preBidDiscardWaitList = Array.from({ length: this.getPlayerCount() }, (_, i) => i);
            } else {
                this.state.phase = 'BIDDING';
            }
            this.onStateChange?.();
            this.triggerBotTurnIfNeeded();
        }, 3500);
    }

    handleBid(playerIndex: number, bid: Bid | 'PASS') {
        if (this.state.phase !== 'BIDDING') throw new Error("Not bidding phase");
        if (this.state.currentBidderIndex !== playerIndex) throw new Error("Not your turn");

        // Validate Bid
        if (bid !== 'PASS') {
            if (!this.isValidBid(bid)) throw new Error("Invalid bid (must be higher)");
            this.state.winningBid = bid;
            this.state.declarerIndex = playerIndex;
        }

        // Check if everyone passed
        this.state.biddingTurnCount++;
        const totalTurns = this.state.biddingTurnCount;

        if (totalTurns === this.getPlayerCount() && !this.state.winningBid) {
            // All passed -> Redeal
            this.state.biddingTurnCount = 0;
            this.state.bids = []; // Reset mechanism
            this.nextHand();
            return;
        }

        // Check if bidding ends
        // If someone bids Alone (10), end bidding immediately
        if (bid !== 'PASS' && this.isLonerBid(bid.amount)) {
            this.finalizeBid();
            return;
        }

        // Single round starting from left of dealer.
        if (totalTurns === this.getPlayerCount()) {
            this.finalizeBid();
        } else {
            this.state.currentBidderIndex = (this.state.currentBidderIndex + 1) % this.getPlayerCount();
            if (bid !== 'PASS') this.state.bids.push(bid); // Record history
        }

        this.triggerBotTurnIfNeeded();
    }

    // Helper to compare bids
    // Returns value: Normal=30..80, Shoot=100, Alone=200
    private getBidValue(bid: Bid): number {
        // We can treat Shoot as amount=12 internally for comparison? Or just use rules.
        // Game rules imply: Number < Shoot < Alone.
        // We will encode logic here.
        // Problem: Bid structure needs to support 'Shoot' and 'Alone' flags.
        // The Bid interface in types.ts is currently: { amount, type, suit? }.
        // I need to interpret special values.
        // Let's assume amount=9 => Shoot, amount=10 => Alone? Or add flags to Bid type?
        // I'll stick to amount logic: 3-8 normal, 9=Shoot, 10=Alone.
        return bid.amount;
    }

    private isValidBid(bid: Bid): boolean {
        if (!this.state.winningBid) {
            return bid.amount >= 3;
        }
        const currentVal = this.state.winningBid.amount;
        return bid.amount > currentVal;
    }

    private finalizeBid() {
        const winningBid = this.state.winningBid;
        if (!winningBid || this.state.declarerIndex === null) throw new Error("No winning bid");

        // Set Trump
        if (winningBid.type === 'SUIT' && winningBid.suit) {
            this.state.trump = winningBid.suit;
        } else {
            this.state.trump = null; // High or Low
        }

        // Transition
        const isShootOrLoner = this.isShootBid(winningBid.amount) || this.isLonerBid(winningBid.amount);

        if (this.isLonerBid(winningBid.amount)) { // Alone
            this.state.phase = 'TRICK_PLAY';
            // Determine leader, skipping teammates if necessary
            let leader = (this.state.dealerIndex + 1) % this.getPlayerCount();
            if (isShootOrLoner) {
                const declarerTeam = this.state.players[this.state.declarerIndex].team;
                while (this.state.players[leader].team === declarerTeam && leader !== this.state.declarerIndex) {
                    leader = (leader + 1) % this.getPlayerCount();
                }
            }
            this.state.turnIndex = leader;
        } else if (this.isShootBid(winningBid.amount)) { // Shoot
            this.state.phase = 'SHOOT_DISCARD';
            this.state.shootDiscardWaitList = [this.state.declarerIndex];
        } else {
            this.state.phase = 'TRICK_PLAY';
            // Leader is usually left of dealer, or is it declarer?
            // Standard Euchre: Play starts left of dealer.
            this.state.turnIndex = (this.state.dealerIndex + 1) % this.getPlayerCount();
        }
        this.triggerBotTurnIfNeeded();
    }

    handleCardPlay(playerIndex: number, cardId: string) {
        if (this.state.phase !== 'TRICK_PLAY') throw new Error("Not playing phase");
        if (this.state.turnIndex !== playerIndex) throw new Error("Not your turn");

        const player = this.state.players[playerIndex];
        const cardIndex = player.hand.findIndex(c => c.id === cardId);
        if (cardIndex === -1) throw new Error("Card not in hand");
        const card = player.hand[cardIndex];

        // Validate Follow Suit
        if (this.state.currentTrick.leadSuit) {
            const hasLeadSuit = player.hand.some(c => getEffectiveSuit(c, this.state.trump) === this.state.currentTrick.leadSuit);
            const playedEffective = getEffectiveSuit(card, this.state.trump);

            if (hasLeadSuit && playedEffective !== this.state.currentTrick.leadSuit) {
                throw new Error("Must follow suit");
            }
        }

        // Play card
        player.hand.splice(cardIndex, 1);
        this.state.currentTrick.plays.push({ playerIndex, card });

        // Set Lead Suit
        if (!this.state.currentTrick.leadSuit) {
            this.state.currentTrick.leadSuit = getEffectiveSuit(card, this.state.trump);
        }

        // Check Trick End
        // Normal: 6 players. Alone/Shoot: 4 players (1 vs 3).
        // If Alone or Shoot, partners don't play.
        const isAlone = this.state.winningBid
            ? (this.isLonerBid(this.state.winningBid.amount) || this.isShootBid(this.state.winningBid.amount))
            : false;
        const declarer = this.state.declarerIndex!;
        const declarerTeam = this.state.players[declarer].team;

        // Who acts next?
        // Logic needed for skipping partners in Alone/Shoot mode.

        const expectedPlays = isAlone
            ? 1 + this.state.players.filter(p => p.team !== declarerTeam).length
            : this.getPlayerCount();

        if (this.state.currentTrick.plays.length === expectedPlays) {
            this.resolveTrick();
        } else {
            // Next player
            let next = (playerIndex + 1) % this.getPlayerCount();
            if (isAlone) {
                // Skip declarer's partners
                while (this.state.players[next].team === declarerTeam && next !== declarer) {
                    next = (next + 1) % this.getPlayerCount();
                }
            }
            this.state.turnIndex = next;
        }
        this.triggerBotTurnIfNeeded();
    }

    private resolveTrick() {
        const winnerRelIndex = determineTrickWinner(
            this.state.currentTrick.plays.map(p => p.card),
            this.state.currentTrick.leadSuit,
            this.state.trump,
            this.state.winningBid!.type
        );

        const winner = this.state.currentTrick.plays[winnerRelIndex];
        this.state.currentTrick.winnerIndex = winner.playerIndex;

        // Add to history
        this.state.tricksHistory.push({ ...this.state.currentTrick });

        this.state.phase = 'TRICK_END';
        if (this.onStateChange) this.onStateChange();

        // 1.5s delay so players can see the completed trick + winner
        setTimeout(() => {
            // Reset trick
            this.state.currentTrick = { leadSuit: null, plays: [], winnerIndex: null };
            this.state.turnIndex = winner.playerIndex; // Winner leads

            // Check Hand End
            if (this.state.tricksHistory.length === this.getHandTrickCount()) {
                this.scoreHand();
            } else {
                this.state.phase = 'TRICK_PLAY';
                this.triggerBotTurnIfNeeded();
            }
            if (this.onStateChange) this.onStateChange();
        }, 1500);
    }

    private scoreHand() {
        // Tally tricks
        const tricksA = this.state.tricksHistory.filter(t => this.state.players[t.winnerIndex!].team === 'A').length;
        const tricksB = this.state.tricksHistory.filter(t => this.state.players[t.winnerIndex!].team === 'B').length;

        const winningBid = this.state.winningBid!;
        const declarerTeam = this.state.players[this.state.declarerIndex!].team;
        const bidAmount = this.isShootBid(winningBid.amount) || this.isLonerBid(winningBid.amount)
            ? this.getHandTrickCount()
            : winningBid.amount;

        const tookTricks = declarerTeam === 'A' ? tricksA : tricksB;

        // Logic
        let points = 0;
        let success = tookTricks >= bidAmount;

        if (winningBid.amount === 9) { // 2-card shoot
            if (tookTricks === this.getHandTrickCount()) {
                this.state.scores[declarerTeam] += 12;
            } else {
                this.state.scores[declarerTeam] -= this.state.gameMode === 'MEGA_DRAFT' ? 24 : 12;
                this.state.scores[declarerTeam === 'A' ? 'B' : 'A'] += (declarerTeam === 'A' ? tricksB : tricksA);
            }
        } else if (this.isOneCardShootBid(winningBid.amount)) { // 1-card shoot (Mega Draft)
            if (tookTricks === this.getHandTrickCount()) {
                this.state.scores[declarerTeam] += 18;
            } else {
                this.state.scores[declarerTeam] -= 36;
                this.state.scores[declarerTeam === 'A' ? 'B' : 'A'] += (declarerTeam === 'A' ? tricksB : tricksA);
            }
        } else if (this.isLonerBid(winningBid.amount)) { // Alone
            if (tookTricks === this.getHandTrickCount()) {
                this.state.scores[declarerTeam] += 24;
            } else {
                this.state.scores[declarerTeam] -= this.state.gameMode === 'MEGA_DRAFT' ? 48 : 24;
                this.state.scores[declarerTeam === 'A' ? 'B' : 'A'] += (declarerTeam === 'A' ? tricksB : tricksA);
            }
        } else {
            // Normal
            if (success) {
                this.state.scores[declarerTeam] += tookTricks;
                // Also give points to opponents for their tricks
                this.state.scores[declarerTeam === 'A' ? 'B' : 'A'] += (declarerTeam === 'A' ? tricksB : tricksA);
            } else {
                this.state.scores[declarerTeam] -= bidAmount;
                this.state.scores[declarerTeam === 'A' ? 'B' : 'A'] += (declarerTeam === 'A' ? tricksB : tricksA);
            }
        }

        // Game Over Check
        if (this.getGameOverReached()) {
            this.state.phase = 'GAME_OVER';
        } else {
            this.nextHand();
        }
    }

    // Shoot Logic: Discard + Pass
    handlePreBidDiscard(playerIndex: number, cardIds: string[]) {
        if (this.state.phase !== 'PRE_BID_DISCARD') throw new Error("Wrong phase");
        if (!this.state.preBidDiscardWaitList.includes(playerIndex)) throw new Error("Not waiting for you");
        if (cardIds.length !== 4) throw new Error("Must discard 4");

        const p = this.state.players[playerIndex];
        const handIds = new Set(p.hand.map(c => c.id));
        for (const id of cardIds) {
            if (!handIds.has(id)) throw new Error("Card not in hand");
        }
        p.hand = p.hand.filter(c => !cardIds.includes(c.id));

        this.state.preBidDiscardWaitList = this.state.preBidDiscardWaitList.filter(i => i !== playerIndex);
        if (this.state.preBidDiscardWaitList.length === 0) {
            this.state.phase = 'BIDDING';
        }
        this.triggerBotTurnIfNeeded();
    }

    // Shoot Logic: Discard + Pass
    handleShootDiscard(playerIndex: number, cardIds: string[]) {
        if (this.state.phase !== 'SHOOT_DISCARD') throw new Error("Wrong phase");
        if (playerIndex !== this.state.declarerIndex) throw new Error("Not shooter");
        const requiredDiscard = this.getShootDiscardCount();
        if (cardIds.length !== requiredDiscard) throw new Error(`Must discard ${requiredDiscard}`);

        const p = this.state.players[playerIndex];
        const handIds = new Set(p.hand.map(c => c.id));
        for (const id of cardIds) {
            if (!handIds.has(id)) throw new Error("Card not in hand");
        }
        p.hand = p.hand.filter(c => !cardIds.includes(c.id));

        this.state.phase = 'SHOOT_PASS';
        // Partners need to pass
        const partners = this.state.players
            .map((pl, i) => ({ pl, i }))
            .filter(({ pl, i }) => pl.team === p.team && i !== playerIndex)
            .map(x => x.i);
        const copies = this.getShootPassCountPerPartner();
        this.state.shootPassWaitList = partners.flatMap(i => Array.from({ length: copies }, () => i));

        this.triggerBotTurnIfNeeded();
    }

    /* ==========================================================
       TRAM ("The Rest Are Mine")
       ==========================================================
       Determines whether a player on lead is guaranteed to win
       every remaining trick personally, no matter how the
       opposition plays. Computed via a recursive worst-case
       simulation. Hands are small (≤ 8) so this is tractable.
    */

    /**
     * True if the given player is currently allowed to claim the rest of
     * the hand. Conditions:
     *   - Phase is TRICK_PLAY and the current trick is empty (the player
     *     is on lead).
     *   - turnIndex points at the player.
     *   - The player has at least 2 cards (one card just play it).
     *   - A worst-case simulation shows the player wins every remaining
     *     trick despite optimal opposition.
     */
    canClaimRest(playerIndex: number): boolean {
        const s = this.state;
        if (s.phase !== 'TRICK_PLAY') return false;
        if (s.turnIndex !== playerIndex) return false;
        if (s.currentTrick.plays.length !== 0) return false;
        if (!s.winningBid || s.declarerIndex === null) return false;

        const player = s.players[playerIndex];
        if (!player) return false;
        if (player.hand.length < 2) return false;
        // Cap simulation depth — anything deeper is unlikely to be a real claim
        // anyway and could explode in worst case.
        if (player.hand.length > 6) return false;

        // Determine which other players actively play tricks, and treat
        // every one of them as adversarial (worst case for the claimer).
        const others = this.getActiveOtherSeatIndices(playerIndex);
        if (others.length === 0) return false;

        const oppHands: Card[][] = others.map(i => [...s.players[i].hand]);
        const trump = s.trump;
        const bidType = s.winningBid.type;

        return this.simulateClaim([...player.hand], oppHands, trump, bidType);
    }

    /** Indices of players (other than `playerIndex`) who still play cards in
     *  the current hand under shoot/loner rules. In normal bids this is just
     *  every other player. */
    private getActiveOtherSeatIndices(playerIndex: number): number[] {
        const s = this.state;
        const isShootOrAlone = !!s.winningBid &&
            (this.isShootBid(s.winningBid.amount) || this.isLonerBid(s.winningBid.amount));

        if (!isShootOrAlone) {
            return s.players.map((_, i) => i).filter(i => i !== playerIndex);
        }

        const declarerIndex = s.declarerIndex!;
        const decTeam = s.players[declarerIndex].team;
        const myTeam = s.players[playerIndex].team;

        if (myTeam === decTeam) {
            // Only the declarer plays from this team in shoot/alone. Partners
            // sit out, so they should never be on lead anyway.
            if (playerIndex !== declarerIndex) return [];
            return s.players.map((_, i) => i).filter(i => s.players[i].team !== decTeam);
        }
        // Defender: declarer + other defenders are active.
        return s.players
            .map((_, i) => i)
            .filter(i => i !== playerIndex && (i === declarerIndex || s.players[i].team !== decTeam));
    }

    /** Returns true if the claimer can guarantee winning every remaining
     *  trick personally given some choice of leads, against the worst-case
     *  legal play from each opponent. */
    private simulateClaim(myHand: Card[], oppHands: Card[][], trump: Suit | null, bidType: BidType): boolean {
        if (myHand.length === 0) return true;

        // Try unique leads. Two cards with the same effective suit and rank
        // produce identical trick outcomes, so deduplicate.
        const leadCandidates = this.dedupeLeads(myHand, trump);
        for (const lead of leadCandidates) {
            const leadSuit = getEffectiveSuit(lead, trump);
            if (this.simulateOppPlays(lead, leadSuit, myHand, oppHands, 0, [], trump, bidType)) {
                return true;
            }
        }
        return false;
    }

    /** Recurses across opponents one by one. Returns true iff for EVERY
     *  legal combination of opponent plays, the lead wins this trick AND
     *  the rest of the hand can still be claimed. */
    private simulateOppPlays(
        lead: Card,
        leadSuit: Suit,
        myHand: Card[],
        oppHands: Card[][],
        oppIdx: number,
        playsSoFar: Card[],
        trump: Suit | null,
        bidType: BidType
    ): boolean {
        if (oppIdx === oppHands.length) {
            const allPlays = [lead, ...playsSoFar];
            const winnerIdx = determineTrickWinner(allPlays, leadSuit, trump, bidType);
            if (winnerIdx !== 0) return false;

            const newMyHand = myHand.filter(c => c.id !== lead.id);
            const newOppHands = oppHands.map((h, i) =>
                i < playsSoFar.length ? h.filter(c => c.id !== playsSoFar[i].id) : h
            );
            return this.simulateClaim(newMyHand, newOppHands, trump, bidType);
        }

        const opp = oppHands[oppIdx];
        if (opp.length === 0) {
            // Should not happen if hand sizes are consistent, but be safe:
            return this.simulateOppPlays(lead, leadSuit, myHand, oppHands, oppIdx + 1, playsSoFar, trump, bidType);
        }

        // Must follow lead (effective) suit if possible.
        const followCards = opp.filter(c => getEffectiveSuit(c, trump) === leadSuit);
        const candidates = followCards.length > 0 ? followCards : opp;
        const unique = this.dedupeResponses(candidates, leadSuit, trump, bidType);

        for (const play of unique) {
            if (!this.simulateOppPlays(lead, leadSuit, myHand, oppHands, oppIdx + 1, [...playsSoFar, play], trump, bidType)) {
                return false;
            }
        }
        return true;
    }

    private dedupeLeads(cards: Card[], trump: Suit | null): Card[] {
        const seen = new Set<string>();
        const out: Card[] = [];
        for (const c of cards) {
            // Distinguish (effective suit, rank, isLeftBower) — left bower differs
            // from the natural J of trump in subtle ways but for trick outcomes
            // they have the same effective suit and a distinct value, so include
            // suit info so we don't accidentally collapse them.
            const eff = getEffectiveSuit(c, trump);
            const key = `${eff}|${c.rank}|${c.suit}`;
            if (!seen.has(key)) { seen.add(key); out.push(c); }
        }
        return out;
    }

    private dedupeResponses(cards: Card[], leadSuit: Suit, trump: Suit | null, bidType: BidType): Card[] {
        // Two cards with the same trick value (relative to this lead) are
        // strategically equivalent for the opponent.
        const seen = new Set<number>();
        const out: Card[] = [];
        for (const c of cards) {
            const v = getCardValue(c, leadSuit, trump, bidType);
            if (!seen.has(v)) { seen.add(v); out.push(c); }
        }
        return out;
    }

    /**
     * Player declares the rest of the hand. All remaining tricks are awarded
     * to the claimer; the hand immediately moves to scoring. Server validates
     * eligibility, so a forged claim is rejected with an error.
     */
    handleClaimRest(playerIndex: number) {
        if (!this.canClaimRest(playerIndex)) {
            throw new Error("You can't claim the rest right now");
        }

        const claimer = this.state.players[playerIndex];
        this.state.tramClaim = {
            playerIndex,
            playerName: claimer.name,
            cards: [...claimer.hand],
        };

        const remaining = this.getHandTrickCount() - this.state.tricksHistory.length;
        for (let i = 0; i < remaining; i++) {
            this.state.tricksHistory.push({
                leadSuit: null,
                plays: [],
                winnerIndex: playerIndex,
            });
        }

        // Drain hands so the UI stops showing cards mid-claim.
        this.state.players.forEach(p => { p.hand = []; });
        this.state.currentTrick = { leadSuit: null, plays: [], winnerIndex: null };
        this.state.turnIndex = -1;
        this.state.phase = 'SCORING';

        // Broadcast TRAM reveal first; score and deal after a short pause.
        this.onStateChange?.();
        setTimeout(() => {
            this.scoreHand();
            this.onStateChange?.();
        }, 4000);
    }

    handleShootPass(playerIndex: number, cardId: string) {
        if (this.state.phase !== 'SHOOT_PASS') throw new Error("Wrong phase");
        if (!this.state.shootPassWaitList.includes(playerIndex)) throw new Error("Not waiting for you");

        const giver = this.state.players[playerIndex];
        const receiver = this.state.players[this.state.declarerIndex!];

        const cardIdx = giver.hand.findIndex(c => c.id === cardId);
        if (cardIdx === -1) throw new Error("Card not in hand");
        const card = giver.hand[cardIdx];
        giver.hand.splice(cardIdx, 1);
        receiver.hand.push(card);

        const removeIdx = this.state.shootPassWaitList.indexOf(playerIndex);
        if (removeIdx === -1) throw new Error("Not waiting for you");
        this.state.shootPassWaitList.splice(removeIdx, 1);

        if (this.state.shootPassWaitList.length === 0) {
            this.state.phase = 'TRICK_PLAY';
            // Determine leader, skipping teammates if necessary
            let leader = (this.state.dealerIndex + 1) % this.getPlayerCount();
            const declarerTeam = this.state.players[this.state.declarerIndex!].team;
            while (this.state.players[leader].team === declarerTeam && leader !== this.state.declarerIndex) {
                leader = (leader + 1) % this.getPlayerCount();
            }
            this.state.turnIndex = leader;
        }
        this.triggerBotTurnIfNeeded();
    }

    resetForNewGame() {
        this.state.phase = 'LOBBY';
        this.state.scores = { A: 0, B: 0 };
        this.state.bids = [];
        this.state.winningBid = null;
        this.state.declarerIndex = null;
        this.state.trump = null;
        this.state.currentTrick = { leadSuit: null, plays: [], winnerIndex: null };
        this.state.tricksHistory = [];
        this.state.turnIndex = -1;
        this.state.currentBidderIndex = -1;
        this.state.biddingTurnCount = 0;
        this.state.dealerIndex = -1;
        this.state.preBidDiscardWaitList = [];
        this.state.shootDiscardWaitList = [];
        this.state.shootPassWaitList = [];
        this.state.players.forEach(p => p.hand = []);

        const humans = this.state.players.filter(p => !p.isBot);
        this.state.players = humans;
        if (humans.length > 0) {
            this.state.hostId = humans[0].id;
        }
    }

    triggerBotTurnIfNeeded() {
        if (this.botTimeout) clearTimeout(this.botTimeout);

        let activeIndex = -1;
        if (this.state.phase === 'BIDDING') activeIndex = this.state.currentBidderIndex;
        else if (this.state.phase === 'PRE_BID_DISCARD') activeIndex = this.state.preBidDiscardWaitList[0] ?? -1;
        else if (this.state.phase === 'TRICK_PLAY') activeIndex = this.state.turnIndex;
        else if (this.state.phase === 'SHOOT_DISCARD') activeIndex = this.state.shootDiscardWaitList[0] ?? -1;
        else if (this.state.phase === 'SHOOT_PASS') activeIndex = this.state.shootPassWaitList[0] ?? -1;

        if (activeIndex === -1) return;

        const player = this.state.players[activeIndex];
        if (!player || !player.isBot) return;

        // Schedule bot action
        this.botTimeout = setTimeout(() => {
            this.executeBotAction(activeIndex);
        }, 800);
    }

    private executeBotAction(playerIndex: number) {
        try {
            if (this.state.phase === 'BIDDING') {
                const bid = BotAI.calculateBid(this.state, playerIndex);
                this.handleBid(playerIndex, bid);
            } else if (this.state.phase === 'PRE_BID_DISCARD') {
                const cardIds = BotAI.choosePreBidDiscard(this.state, playerIndex);
                this.handlePreBidDiscard(playerIndex, cardIds);
            } else if (this.state.phase === 'TRICK_PLAY') {
                const cardId = BotAI.chooseCardToPlay(this.state, playerIndex);
                this.handleCardPlay(playerIndex, cardId);
            } else if (this.state.phase === 'SHOOT_DISCARD') {
                const cardIds = BotAI.chooseDiscard(this.state, playerIndex);
                this.handleShootDiscard(playerIndex, cardIds);
            } else if (this.state.phase === 'SHOOT_PASS') {
                const cardId = BotAI.choosePass(this.state, playerIndex);
                this.handleShootPass(playerIndex, cardId);
            }

            // Notify if bound
            if (this.onStateChange) this.onStateChange();
        } catch (e) {
            console.error("Bot AI threw error:", e);
        }
    }
}
