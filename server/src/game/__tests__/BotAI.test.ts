import { describe, it, expect } from 'vitest';
import { GameState, Card, Player } from '../../types';
import { BotAI } from '../BotAI';

describe('BotAI', () => {
    const createEmptyState = (): GameState => ({
        roomId: 'test',
        isPrivate: false,
        hostId: null,
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
        dealerIndex: 0,
        biddingTurnCount: 0,
        trump: null
    });

    const createPlayer = (id: string, hand: Card[]): Player => ({
        id, name: 'Bot', team: 'A', hand, isConnected: true, isBot: true, seatIndex: 0
    });

    it('bids HIGH when it has many aces and faces', () => {
        const state = createEmptyState();
        const hand: Card[] = [
            { id: '1', suit: 'Spades', rank: 'A' },
            { id: '2', suit: 'Spades', rank: 'K' },
            { id: '3', suit: 'Hearts', rank: 'A' },
            { id: '4', suit: 'Hearts', rank: 'K' },
            { id: '5', suit: 'Clubs', rank: 'A' },
            { id: '6', suit: 'Diamonds', rank: 'A' },
            { id: '7', suit: 'Diamonds', rank: 'K' },
            { id: '8', suit: 'Diamonds', rank: 'Q' },
        ];
        state.players.push(createPlayer('b1', hand));

        const bid = BotAI.calculateBid(state, 0);
        expect(bid).not.toBe('PASS');
        if (bid !== 'PASS') {
            expect(bid.type).toBe('HIGH');
            expect(bid.amount).toBeGreaterThanOrEqual(3);
        }
    });

    it('passes with a terrible hand', () => {
        const state = createEmptyState();
        // Winning bid is already 4
        state.winningBid = { playerIndex: 1, amount: 4, type: 'SUIT', suit: 'Spades' };

        const hand: Card[] = [
            { id: '1', suit: 'Spades', rank: '9' },
            { id: '2', suit: 'Spades', rank: 'A' },
            { id: '3', suit: 'Hearts', rank: 'J' },
            { id: '4', suit: 'Hearts', rank: 'Q' },
            { id: '5', suit: 'Clubs', rank: '10' },
            { id: '6', suit: 'Clubs', rank: 'K' },
            { id: '7', suit: 'Diamonds', rank: '9' },
            { id: '8', suit: 'Diamonds', rank: 'A' },
        ];
        state.players.push(createPlayer('b1', hand));

        const bid = BotAI.calculateBid(state, 0);
        expect(bid).toBe('PASS'); // Too weak to beat a 4 bid
    });

    it('plays a valid card following suit', () => {
        const state = createEmptyState();
        state.trump = 'Spades';
        state.currentTrick.leadSuit = 'Hearts';
        state.currentTrick.plays = [
            { playerIndex: 1, card: { id: 'hA', suit: 'Hearts', rank: 'A' } }
        ];

        const hand: Card[] = [
            { id: 's9', suit: 'Spades', rank: '9' },
            { id: 'h9', suit: 'Hearts', rank: '9' }, // Must play this
            { id: 'c9', suit: 'Clubs', rank: '9' },
        ];
        state.players.push(createPlayer('b1', hand));

        const cardId = BotAI.chooseCardToPlay(state, 0);
        expect(cardId).toBe('h9');
    });
});
