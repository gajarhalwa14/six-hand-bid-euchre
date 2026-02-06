import { Card, Suit, Rank, BidType } from '../types';

const RANK_VALUES: Record<Rank, number> = {
    '9': 0, '10': 1, 'J': 2, 'Q': 3, 'K': 4, 'A': 5
};

const LOW_RANK_VALUES: Record<Rank, number> = {
    'A': 0, 'K': 1, 'Q': 2, 'J': 3, '10': 4, '9': 5
};

// Helper: Get card color
function getColor(suit: Suit): 'Red' | 'Black' {
    return (suit === 'Hearts' || suit === 'Diamonds') ? 'Red' : 'Black';
}

// Helper: Check if card is Left Bower
function isLeftBower(card: Card, trump: Suit | null): boolean {
    if (!trump || trump === 'Hearts' || trump === 'Diamonds' || trump === 'Clubs' || trump === 'Spades') {
        // Normal trump
        if (!trump) return false;
        const trumpColor = getColor(trump);
        if (card.rank === 'J' && getColor(card.suit) === trumpColor && card.suit !== trump) {
            return true;
        }
    }
    return false;
}

function isRightBower(card: Card, trump: Suit | null): boolean {
    return !!trump && card.suit === trump && card.rank === 'J';
}

// Get effective suit (Left Bower counts as Trump)
export function getEffectiveSuit(card: Card, trump: Suit | null): Suit {
    if (!trump) return card.suit;
    if (isLeftBower(card, trump)) return trump;
    return card.suit;
}

// Get value of card for comparison
// Returns a value that can be compared relative to other cards in the SAME trick context
// Higher is better.
export function getCardValue(card: Card, leadSuit: Suit | null, trump: Suit | null, bidType: BidType): number {
    // 1. High/Low Bid Logic (No Trump)
    if (bidType === 'HIGH') {
        const isLead = leadSuit && card.suit === leadSuit;
        const val = RANK_VALUES[card.rank];
        // If it follows suit, it has value. If not, it's 0 (unless we want to track rank for stats, but for winning: only lead suit matters)
        // But wait, if playing Card 2 vs Card 1, and Card 2 is off-suit, Card 1 wins.
        // We will assign a large offset for Lead Suit.
        if (isLead) return 100 + val;
        return val; // Off suit
    }

    if (bidType === 'LOW') {
        const isLead = leadSuit && card.suit === leadSuit;
        const val = LOW_RANK_VALUES[card.rank];
        if (isLead) return 100 + val;
        return val;
    }

    // 2. Trump Logic (Suit Logic)
    // Hierarchy: Right > Left > Trump Suited > Lead Suited > Off Suited

    const isRight = isRightBower(card, trump);
    const isLeft = isLeftBower(card, trump);

    if (isRight) return 1000;
    if (isLeft) return 900;

    const effectiveSuit = getEffectiveSuit(card, trump);

    if (trump && effectiveSuit === trump) {
        // Trump suit, non-bower
        return 500 + RANK_VALUES[card.rank];
    }

    if (leadSuit && effectiveSuit === leadSuit) {
        // Lead suit (non-trump)
        return 200 + RANK_VALUES[card.rank];
    }

    // Off suit
    return RANK_VALUES[card.rank];
}

// Winner determination
// Returns the index of the winning card in the array
export function determineTrickWinner(playedCards: Card[], leadSuit: Suit | null, trump: Suit | null, bidType: BidType): number {
    if (playedCards.length === 0) return -1;

    // First card establishes lead if not provided?
    // Usually the caller provides leadSuit based on what the first player ACTUALLY played.
    // We assume playedCards[0] is the lead card if leadSuit matches its effective suit.

    let bestIndex = 0;
    let bestValue = -1; // Value of card at bestIndex

    // If duplicates => First one wins.
    // We iterate 0..N. If strict > best, new winner. If == best, old winner stays (first played).

    // Calculate value for the FIRST card to initialize
    // Note: The effective lead suit IS determined by the first card played.
    // The Game Logic must pass the CORRECT leadSuit (handling Left Bower as Trump lead).

    for (let i = 0; i < playedCards.length; i++) {
        const val = getCardValue(playedCards[i], leadSuit, trump, bidType);
        if (val > bestValue) {
            bestValue = val;
            bestIndex = i;
        }
        // If val == bestValue, keep bestIndex (first played wins rule)
    }

    return bestIndex;
}
