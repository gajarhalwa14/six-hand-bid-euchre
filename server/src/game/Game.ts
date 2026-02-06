import { GameState, Player, Card, Bid, Suit, Phase, Trick, TeamId, SUITS, BidType } from '../types';
import { Deck } from './Deck';
import { determineTrickWinner, getEffectiveSuit } from './CardUtils';

export class Game {
    state: GameState;
    private deck: Deck;

    constructor(roomId: string) {
        this.deck = new Deck();
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
            trump: null
        };
    }

    addPlayer(id: string, name: string): Player | null {
        if (this.state.players.length >= 6) return null;
        const team: TeamId = this.state.players.length % 2 === 0 ? 'A' : 'B';
        const player: Player = {
            id, name, team, hand: [], isConnected: true
        };
        this.state.players.push(player);
        return player;
    }

    // Start game from Lobby
    start() {
        if (this.state.players.length !== 6) throw new Error("Need 6 players");
        this.state.dealerIndex = Math.floor(Math.random() * 6);
        this.state.scores = { A: 0, B: 0 };
        this.nextHand();
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

        // Reset trick
        this.state.currentTrick = { leadSuit: null, plays: [], winnerIndex: null };
        this.state.turnIndex = winner.playerIndex; // Winner leads

        // Check Hand End
        if (this.state.tricksHistory.length === 8) {
            this.scoreHand();
        }
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
    }
}
