import { Card, Suit, Rank, SUITS, RANKS } from '../types';

export class Deck {
    private cards: Card[] = [];

    constructor() {
        this.reset();
    }

    reset() {
        this.cards = [];
        // Two decks
        for (let i = 0; i < 2; i++) {
            for (const suit of SUITS) {
                for (const rank of RANKS) {
                    this.cards.push({
                        id: `${i}-${suit}-${rank}`, // Unique ID
                        suit,
                        rank
                    });
                }
            }
        }
    }

    shuffle() {
        // Fisher-Yates shuffle
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    deal(numPlayers: number = 6, cardsPerPlayer: number = 8): Card[][] {
        if (numPlayers * cardsPerPlayer > this.cards.length) {
            throw new Error("Not enough cards to deal");
        }
        const hands: Card[][] = Array(numPlayers).fill(null).map(() => []);

        // Traditional dealing (3-2-3 or similar) doesn't matter much for computers, 
        // but 1 by 1 is easiest to implement.
        let cardIndex = 0;
        for (let i = 0; i < cardsPerPlayer; i++) {
            for (let p = 0; p < numPlayers; p++) {
                hands[p].push(this.cards[cardIndex++]);
            }
        }
        return hands;
    }

    /** Two cards at a time to each seat, starting left of dealer (matches client dealing animation). */
    dealInRotatingPairs(numPlayers: number, cardsPerPlayer: number, dealerSeat: number): Card[][] {
        if (cardsPerPlayer % 2 !== 0) throw new Error("cardsPerPlayer must be even");
        if (numPlayers * cardsPerPlayer > this.cards.length) {
            throw new Error("Not enough cards to deal");
        }
        const hands: Card[][] = Array.from({ length: numPlayers }, () => []);
        let cardIndex = 0;
        const pairRounds = cardsPerPlayer / 2;
        for (let r = 0; r < pairRounds; r++) {
            for (let off = 1; off <= numPlayers; off++) {
                const seat = (dealerSeat + off) % numPlayers;
                hands[seat].push(this.cards[cardIndex++]);
                hands[seat].push(this.cards[cardIndex++]);
            }
        }
        return hands;
    }
}
