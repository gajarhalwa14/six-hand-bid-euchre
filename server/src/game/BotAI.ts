import { GameState, Bid, Card, Suit, BidType } from '../types';
import { getEffectiveSuit, determineTrickWinner } from './CardUtils';

export class BotAI {

    // Evaluate hand and return a reasonable bid
    static calculateBid(state: GameState, playerIndex: number): Bid | 'PASS' {
        const player = state.players[playerIndex];
        const hand = player.hand;

        // Simple heuristic: Count high cards (A=3, K=2, Q=1) per suit, plus length
        let bestSuit: Suit | null = null;
        let bestSuitScore = -1;

        const suits: Suit[] = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];
        suits.forEach(suit => {
            let score = 0;
            const suitCards = hand.filter(c => c.suit === suit);
            score += suitCards.length * 1.5; // Weight length

            suitCards.forEach(c => {
                if (c.rank === 'A') score += 3;
                if (c.rank === 'K') score += 2;
                if (c.rank === 'Q') score += 1;
            });

            if (score > bestSuitScore) {
                bestSuitScore = score;
                bestSuit = suit;
            }
        });

        // Evaluate High/Low potential
        let highScore = 0;
        let lowScore = 0;
        hand.forEach(c => {
            if (['A', 'K', 'Q'].includes(c.rank)) highScore += 2;
            if (['9', '10', 'J'].includes(c.rank)) lowScore += 2;
        });

        let bestType: BidType = 'SUIT';
        let maxValue = bestSuitScore;

        if (highScore > maxValue) {
            maxValue = highScore;
            bestType = 'HIGH';
        }
        if (lowScore > maxValue) {
            maxValue = lowScore;
            bestType = 'LOW';
        }

        // Translate score to bid amount
        // Thresholds are arbitrary: > 10 = bid 3, > 13 = bid 4, etc.
        let amount = 0;
        if (maxValue > 16) amount = 6;
        else if (maxValue > 14) amount = 5;
        else if (maxValue > 12) amount = 4;
        else if (maxValue > 9) amount = 3;

        const currentWinning = state.winningBid?.amount || 2; // 2 means min bid is 3

        if (amount > currentWinning) {
            return {
                playerIndex,
                amount,
                type: bestType,
                suit: bestType === 'SUIT' ? bestSuit! : undefined
            };
        }

        return 'PASS';
    }

    // Choose card to play during TRICK_PLAY
    static chooseCardToPlay(state: GameState, playerIndex: number): string {
        const player = state.players[playerIndex];
        const hand = player.hand;
        const trick = state.currentTrick;
        const trump = state.trump;

        // If leading, play highest card of longest suit
        if (trick.plays.length === 0) {
            // Sort by arbitrary strength (simplified)
            const sorted = [...hand].sort((a, b) => this.cardValue(b.rank) - this.cardValue(a.rank));
            return sorted[0].id;
        }

        // Must follow suit
        const leadSuit = trick.leadSuit!;
        const validPlays = hand.filter(c => getEffectiveSuit(c, trump) === leadSuit);
        const options = validPlays.length > 0 ? validPlays : hand;

        // Simplified strategy: If we have valid plays, try to win if we are last, otherwise just play lowest valid
        // Real logic would be much more complex (checking if partner is winning, etc.)
        // For now: Always play the lowest valid card to ensure valid match progression.
        options.sort((a, b) => this.cardValue(a.rank) - this.cardValue(b.rank));
        return options[0].id;
    }

    // Shoot Discard: pick 2 lowest cards
    static chooseDiscard(state: GameState, playerIndex: number): string[] {
        const player = state.players[playerIndex];
        const hand = [...player.hand].sort((a, b) => this.cardValue(a.rank) - this.cardValue(b.rank));
        return [hand[0].id, hand[1].id];
    }

    // Shoot Pass: pick lowest card
    static choosePass(state: GameState, playerIndex: number): string {
        const player = state.players[playerIndex];
        const hand = [...player.hand].sort((a, b) => this.cardValue(a.rank) - this.cardValue(b.rank));
        return hand[0].id;
    }

    private static cardValue(rank: string): number {
        const ranks = ['9', '10', 'J', 'Q', 'K', 'A'];
        return ranks.indexOf(rank);
    }
}
