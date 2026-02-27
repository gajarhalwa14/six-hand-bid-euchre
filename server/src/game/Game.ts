import { GameState, Player, Card, Bid, Suit, Phase, Trick, TeamId, SUITS, BidType } from '../types';
import { Deck } from './Deck';
import { determineTrickWinner, getEffectiveSuit } from './CardUtils';
import { BotAI } from './BotAI';

export class Game {
    state: GameState;
    private deck: Deck;
    public onStateChange?: () => void;
    private botTimeout?: NodeJS.Timeout;
    public lastActivityTime: number;

    constructor(roomId: string, isPrivate: boolean = false) {
        this.deck = new Deck();
        this.lastActivityTime = Date.now();
        this.state = {
            roomId,
            players: [],
            phase: 'LOBBY',
            currentBidderIndex: -1,
            bids: [],
            winningBid: null,
            declarerIndex: null,
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
            hostId: null
        };
    }

    markActivity() {
        this.lastActivityTime = Date.now();
    }

    addPlayer(id: string, name: string): Player | null {
        if (this.state.players.length >= 6) return null;

        let seatIndex: number | undefined;
        if (this.state.isPrivate) {
            // Find first available seat
            const taken = new Set(this.state.players.map(p => p.seatIndex));
            for (let i = 0; i < 6; i++) {
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
            const availableSeats = [0, 1, 2, 3, 4, 5].filter(i =>
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
            id, name, team, hand: [], isConnected: true, seatIndex, isBot: false
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
        if (targetSeat < 0 || targetSeat > 5) return;

        const player = this.state.players.find(p => p.id === playerId);
        if (!player) return;

        const occupier = this.state.players.find(p => p.seatIndex === targetSeat);
        if (occupier) {
            // Swap seats
            occupier.seatIndex = player.seatIndex;
            occupier.team = (occupier.seatIndex! % 2 === 0) ? 'A' : 'B';
        }

        player.seatIndex = targetSeat;
        player.team = (targetSeat % 2 === 0) ? 'A' : 'B';
    }

    handleRandomizeSeats(playerId: string) {
        if (!this.state.isPrivate || this.state.phase !== 'LOBBY' || this.state.hostId !== playerId) return;

        const available = [0, 1, 2, 3, 4, 5];
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
        for (let i = 0; i < 6; i++) {
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

        this.state.dealerIndex = Math.floor(Math.random() * 6);
        this.state.scores = { A: 0, B: 0 };
        this.nextHand();
        this.triggerBotTurnIfNeeded();
    }

    private nextHand() {
        this.state.dealerIndex = (this.state.dealerIndex + 1) % 6;
        this.deck.reset();
        this.deck.shuffle();

        const hands = this.deck.deal(6, 8);
        this.state.players.forEach((p, i) => p.hand = hands[i]);

        this.state.phase = 'BIDDING';
        this.state.currentBidderIndex = (this.state.dealerIndex + 1) % 6;
        this.state.bids = [];
        this.state.biddingTurnCount = 0;
        this.state.winningBid = null;
        this.state.declarerIndex = null;
        this.state.trump = null;

        // Reset trick state
        this.state.currentTrick = { leadSuit: null, plays: [], winnerIndex: null };
        this.state.tricksHistory = [];

        this.triggerBotTurnIfNeeded();
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

        if (totalTurns === 6 && !this.state.winningBid) {
            // All passed -> Redeal
            this.state.biddingTurnCount = 0;
            this.state.bids = []; // Reset mechanism
            this.nextHand();
            return;
        }

        // Check if bidding ends
        // If someone bids Alone (10), end bidding immediately
        if (bid !== 'PASS' && bid.amount === 10) {
            this.finalizeBid();
            return;
        }

        // Single round starting from left of dealer.
        if (totalTurns === 6) {
            this.finalizeBid();
        } else {
            this.state.currentBidderIndex = (this.state.currentBidderIndex + 1) % 6;
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
        const isShootOrLoner = winningBid.amount === 9 || winningBid.amount === 10;

        if (winningBid.amount === 10) { // Alone
            this.state.phase = 'TRICK_PLAY';
            // Determine leader, skipping teammates if necessary
            let leader = (this.state.dealerIndex + 1) % 6;
            if (isShootOrLoner) {
                const declarerTeam = this.state.players[this.state.declarerIndex].team;
                while (this.state.players[leader].team === declarerTeam && leader !== this.state.declarerIndex) {
                    leader = (leader + 1) % 6;
                }
            }
            this.state.turnIndex = leader;
        } else if (winningBid.amount === 9) { // Shoot
            this.state.phase = 'SHOOT_DISCARD';
            this.state.shootDiscardWaitList = [this.state.declarerIndex];
        } else {
            this.state.phase = 'TRICK_PLAY';
            // Leader is usually left of dealer, or is it declarer?
            // Standard Euchre: Play starts left of dealer.
            this.state.turnIndex = (this.state.dealerIndex + 1) % 6;
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
        const isAlone = this.state.winningBid?.amount === 10 || this.state.winningBid?.amount === 9;
        const declarer = this.state.declarerIndex!;
        const declarerTeam = this.state.players[declarer].team;

        // Who acts next?
        // Logic needed for skipping partners in Alone/Shoot mode.

        const expectedPlays = isAlone ? 4 : 6;

        if (this.state.currentTrick.plays.length === expectedPlays) {
            this.resolveTrick();
        } else {
            // Next player
            let next = (playerIndex + 1) % 6;
            if (isAlone) {
                // Skip declarer's partners
                while (this.state.players[next].team === declarerTeam && next !== declarer) {
                    next = (next + 1) % 6;
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
            if (this.state.tricksHistory.length === 8) {
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
        const bidAmount = winningBid.amount === 9 ? 8 : (winningBid.amount === 10 ? 8 : winningBid.amount);

        const tookTricks = declarerTeam === 'A' ? tricksA : tricksB;

        // Logic
        let points = 0;
        let success = tookTricks >= bidAmount;

        if (winningBid.amount === 9) { // Shoot
            // Must take ALL 8
            if (tookTricks === 8) {
                this.state.scores[declarerTeam] += 12;
            } else {
                this.state.scores[declarerTeam] -= 12;
                this.state.scores[declarerTeam === 'A' ? 'B' : 'A'] += (declarerTeam === 'A' ? tricksB : tricksA);
            }
        } else if (winningBid.amount === 10) { // Alone
            if (tookTricks === 8) {
                this.state.scores[declarerTeam] += 24;
            } else {
                this.state.scores[declarerTeam] -= 24;
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
        if (this.state.scores.A >= 32 || this.state.scores.B >= 32) {
            this.state.phase = 'GAME_OVER';
        } else {
            this.nextHand();
        }
    }

    // Shoot Logic: Discard + Pass
    handleShootDiscard(playerIndex: number, cardIds: string[]) {
        if (this.state.phase !== 'SHOOT_DISCARD') throw new Error("Wrong phase");
        if (playerIndex !== this.state.declarerIndex) throw new Error("Not shooter");
        if (cardIds.length !== 2) throw new Error("Must discard 2");

        const p = this.state.players[playerIndex];
        p.hand = p.hand.filter(c => !cardIds.includes(c.id));

        this.state.phase = 'SHOOT_PASS';
        // Partners need to pass
        this.state.shootPassWaitList = this.state.players
            .map((pl, i) => ({ pl, i }))
            .filter(({ pl, i }) => pl.team === p.team && i !== playerIndex)
            .map(x => x.i);

        this.triggerBotTurnIfNeeded();
    }

    handleShootPass(playerIndex: number, cardId: string) {
        if (this.state.phase !== 'SHOOT_PASS') throw new Error("Wrong phase");
        if (!this.state.shootPassWaitList.includes(playerIndex)) throw new Error("Not waiting for you");

        const giver = this.state.players[playerIndex];
        const receiver = this.state.players[this.state.declarerIndex!];

        const cardIdx = giver.hand.findIndex(c => c.id === cardId);
        const card = giver.hand[cardIdx];
        giver.hand.splice(cardIdx, 1);
        receiver.hand.push(card);

        this.state.shootPassWaitList = this.state.shootPassWaitList.filter(i => i !== playerIndex);

        if (this.state.shootPassWaitList.length === 0) {
            this.state.phase = 'TRICK_PLAY';
            // Determine leader, skipping teammates if necessary
            let leader = (this.state.dealerIndex + 1) % 6;
            const declarerTeam = this.state.players[this.state.declarerIndex!].team;
            while (this.state.players[leader].team === declarerTeam && leader !== this.state.declarerIndex) {
                leader = (leader + 1) % 6;
            }
            this.state.turnIndex = leader;
        }
        this.triggerBotTurnIfNeeded();
    }

    private triggerBotTurnIfNeeded() {
        if (this.botTimeout) clearTimeout(this.botTimeout);

        let activeIndex = -1;
        if (this.state.phase === 'BIDDING') activeIndex = this.state.currentBidderIndex;
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
