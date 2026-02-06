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
}
