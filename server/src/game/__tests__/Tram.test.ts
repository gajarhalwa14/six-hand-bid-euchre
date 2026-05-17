import { describe, it, expect } from 'vitest';
import { Game } from '../Game';
import { Card, Player, TeamId } from '../../types';

/**
 * Tests for the TRAM ("The Rest Are Mine") verifier.
 *
 * Each test sets up a Game in TRICK_PLAY phase with crafted hands and
 * checks whether `canClaimRest` returns the expected value for the
 * given player on lead.
 */

function makeCard(id: string, suit: Card['suit'], rank: Card['rank']): Card {
    return { id, suit, rank };
}

function buildGame(opts: {
    trump: Card['suit'] | null;
    bidType: 'SUIT' | 'HIGH' | 'LOW';
    bidAmount?: number; // default 5 (normal bid)
    /** seat -> hand */
    hands: Card[][];
    /** index of the on-lead player (also turnIndex) */
    leadPlayerIndex: number;
    /** index of the bid declarer (defaults to leadPlayerIndex) */
    declarerIndex?: number;
}): Game {
    const game = new Game('test', false, 'CLASSIC');
    const seatCount = opts.hands.length;
    const players: Player[] = [];
    for (let i = 0; i < seatCount; i++) {
        const team: TeamId = i % 2 === 0 ? 'A' : 'B';
        players.push({
            id: `p${i}`,
            name: `P${i}`,
            team,
            hand: [...opts.hands[i]],
            isConnected: true,
            seatIndex: i,
            isBot: false,
        });
    }
    game.state.players = players;
    game.state.phase = 'TRICK_PLAY';
    game.state.trump = opts.trump;
    game.state.currentTrick = { leadSuit: null, plays: [], winnerIndex: null };
    game.state.turnIndex = opts.leadPlayerIndex;
    game.state.declarerIndex = opts.declarerIndex ?? opts.leadPlayerIndex;
    game.state.winningBid = {
        playerIndex: game.state.declarerIndex!,
        amount: opts.bidAmount ?? 5,
        type: opts.bidType,
        suit: opts.bidType === 'SUIT' ? (opts.trump ?? undefined) : undefined,
    };
    return game;
}

/**
 * For a 6-player game we still need to pad the unused seats with an
 * empty hand of equal length so the simulation does not bail out early.
 * Tests use a 4-seat shorthand for brevity (mega-draft style) when only
 * a couple of opponents matter.
 */

describe('TRAM (The Rest Are Mine) verifier', () => {
    it('rejects when a non-lead player tries to claim', () => {
        const hands = [
            [makeCard('1', 'Spades', 'A'), makeCard('2', 'Spades', 'K')],
            [makeCard('3', 'Hearts', '9'), makeCard('4', 'Hearts', '10')],
            [makeCard('5', 'Clubs', '9'),  makeCard('6', 'Clubs', '10')],
            [makeCard('7', 'Diamonds', '9'), makeCard('8', 'Diamonds', '10')],
        ];
        const g = buildGame({ trump: 'Spades', bidType: 'SUIT', hands, leadPlayerIndex: 0 });
        // Seat 1 is not on lead.
        expect(g.canClaimRest(1)).toBe(false);
    });

    it('rejects when the trick is already in progress', () => {
        const hands = [
            [makeCard('1', 'Spades', 'A'), makeCard('2', 'Spades', 'K')],
            [makeCard('3', 'Hearts', '9'), makeCard('4', 'Hearts', '10')],
            [makeCard('5', 'Clubs', '9'),  makeCard('6', 'Clubs', '10')],
            [makeCard('7', 'Diamonds', '9'), makeCard('8', 'Diamonds', '10')],
        ];
        const g = buildGame({ trump: 'Spades', bidType: 'SUIT', hands, leadPlayerIndex: 0 });
        g.state.currentTrick.plays.push({
            playerIndex: 0,
            card: makeCard('1', 'Spades', 'A'),
        });
        expect(g.canClaimRest(0)).toBe(false);
    });

    it('accepts when the lead has the two highest trumps and opponents only hold lower trumps', () => {
        const hands = [
            // Lead: right bower + ace of trump
            [makeCard('1', 'Spades', 'J'), makeCard('2', 'Spades', 'A')],
            [makeCard('3', 'Spades', 'K'), makeCard('4', 'Spades', 'Q')],
            [makeCard('5', 'Spades', '10'), makeCard('6', 'Spades', '9')],
            [makeCard('7', 'Hearts', '9'),  makeCard('8', 'Hearts', '10')],
        ];
        const g = buildGame({ trump: 'Spades', bidType: 'SUIT', hands, leadPlayerIndex: 0 });
        expect(g.canClaimRest(0)).toBe(true);
    });

    it('rejects when an opponent still holds a higher trump', () => {
        const hands = [
            // Lead: K and Q of trump (no bowers, no Ace)
            [makeCard('1', 'Spades', 'K'), makeCard('2', 'Spades', 'Q')],
            // Opp 1 has the right bower
            [makeCard('3', 'Spades', 'J'), makeCard('4', 'Spades', '10')],
            [makeCard('5', 'Hearts', '9'),  makeCard('6', 'Hearts', '10')],
            [makeCard('7', 'Diamonds', '9'), makeCard('8', 'Diamonds', '10')],
        ];
        const g = buildGame({ trump: 'Spades', bidType: 'SUIT', hands, leadPlayerIndex: 0 });
        expect(g.canClaimRest(0)).toBe(false);
    });

    it('rejects in HIGH bid when an opponent has a higher card in a suit the leader holds', () => {
        // Off-trump (HIGH) game. Lead has K & Q of one suit, opp has the A.
        const hands = [
            [makeCard('1', 'Spades', 'K'), makeCard('2', 'Spades', 'Q')],
            [makeCard('3', 'Spades', 'A'), makeCard('4', 'Spades', '10')],
            [makeCard('5', 'Hearts', '9'),  makeCard('6', 'Hearts', '10')],
            [makeCard('7', 'Diamonds', '9'), makeCard('8', 'Diamonds', '10')],
        ];
        const g = buildGame({ trump: null, bidType: 'HIGH', hands, leadPlayerIndex: 0 });
        expect(g.canClaimRest(0)).toBe(false);
    });

    it('accepts in HIGH bid when leader holds the two highest cards across the only suits in play', () => {
        // Each opponent only has lower cards in a suit the leader leads.
        const hands = [
            [makeCard('1', 'Spades', 'A'), makeCard('2', 'Hearts', 'A')],
            [makeCard('3', 'Spades', 'K'), makeCard('4', 'Hearts', 'K')],
            [makeCard('5', 'Spades', 'Q'), makeCard('6', 'Hearts', 'Q')],
            [makeCard('7', 'Spades', 'J'), makeCard('8', 'Hearts', 'J')],
        ];
        const g = buildGame({ trump: null, bidType: 'HIGH', hands, leadPlayerIndex: 0 });
        expect(g.canClaimRest(0)).toBe(true);
    });

    it('rejects when an opponent void in lead suit can ruff with trump', () => {
        // Leader has the highest non-trump but an opponent is void and has trump.
        const hands = [
            [makeCard('1', 'Hearts', 'A'), makeCard('2', 'Hearts', 'K')],
            // Void in hearts, has small trump.
            [makeCard('3', 'Spades', '9'), makeCard('4', 'Clubs', '10')],
            [makeCard('5', 'Hearts', '10'), makeCard('6', 'Hearts', 'Q')],
            [makeCard('7', 'Hearts', '9'), makeCard('8', 'Hearts', 'J')],
        ];
        const g = buildGame({ trump: 'Spades', bidType: 'SUIT', hands, leadPlayerIndex: 0 });
        expect(g.canClaimRest(0)).toBe(false);
    });

    it('rejects when the player only has 1 card left (must just play it)', () => {
        const hands = [
            [makeCard('1', 'Spades', 'A')],
            [makeCard('2', 'Hearts', '9')],
            [makeCard('3', 'Hearts', '10')],
            [makeCard('4', 'Hearts', 'J')],
        ];
        const g = buildGame({ trump: 'Spades', bidType: 'SUIT', hands, leadPlayerIndex: 0 });
        expect(g.canClaimRest(0)).toBe(false);
    });

    it('handleClaimRest awards remaining tricks and scores the hand', () => {
        const hands = [
            [makeCard('1', 'Spades', 'J'), makeCard('2', 'Spades', 'A')],
            [makeCard('3', 'Spades', 'K'), makeCard('4', 'Hearts', 'Q')],
            [makeCard('5', 'Hearts', '10'), makeCard('6', 'Hearts', '9')],
            [makeCard('7', 'Diamonds', '9'), makeCard('8', 'Diamonds', '10')],
        ];
        const g = buildGame({ trump: 'Spades', bidType: 'SUIT', hands, leadPlayerIndex: 0 });
        // Pretend 6 of the 8 tricks were already played and won by Team A.
        for (let i = 0; i < 6; i++) {
            g.state.tricksHistory.push({ leadSuit: null, plays: [], winnerIndex: 0 });
        }
        // The claimer's bid was 5; with all 8 tricks they make it and Team A scores 8.
        // (scoreHand is called inside handleClaimRest, which then transitions to the
        // next hand; we just assert the score posted before that.)
        g.handleClaimRest(0);
        expect(g.state.scores.A).toBe(8);
        expect(g.state.scores.B).toBe(0);
    });

    it('handleClaimRest throws when not eligible', () => {
        const hands = [
            [makeCard('1', 'Spades', 'K'), makeCard('2', 'Spades', 'Q')],
            // Opp has the right bower — claim should fail
            [makeCard('3', 'Spades', 'J'), makeCard('4', 'Spades', '10')],
            [makeCard('5', 'Hearts', '9'), makeCard('6', 'Hearts', '10')],
            [makeCard('7', 'Diamonds', '9'), makeCard('8', 'Diamonds', '10')],
        ];
        const g = buildGame({ trump: 'Spades', bidType: 'SUIT', hands, leadPlayerIndex: 0 });
        expect(() => g.handleClaimRest(0)).toThrow();
    });
});
