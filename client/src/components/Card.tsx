import React from 'react';
import type { Card as CardType, Suit } from '../types';
import clsx from 'clsx';
import './Card.css';

interface Props {
    card: CardType;
    onClick?: () => void;
    selected?: boolean;
    playable?: boolean;
    hidden?: boolean;
    isTrump?: boolean;
}

const suitSymbols: Record<Suit, string> = {
    Spades: '♠', Hearts: '♥', Clubs: '♣', Diamonds: '♦'
};

const RANK_DISPLAY: Record<string, string> = {
    'A': 'A', 'K': 'K', 'Q': 'Q', 'J': 'J', '10': '10', '9': '9'
};

function isFaceCard(rank: string): boolean {
    return rank === 'J' || rank === 'Q' || rank === 'K';
}

const FACE_LABELS: Record<string, string> = { 'J': 'J', 'Q': 'Q', 'K': 'K' };

/*
 * Standard pip positions on a playing card.
 * Coordinates are [row, col] where:
 *   row: 0=top .. 8=bottom  (9 rows)
 *   col: 0=left, 1=center, 2=right
 * Pips on the bottom half are flipped upside down on real cards.
 */
const PIP_POSITIONS: Record<number, [number, number, boolean][]> = {
    1: [ // Ace
        [4, 1, false],
    ],
    9: [
        [0, 0, false], [0, 2, false],
        [2, 0, false], [2, 2, false],
        [4, 1, false],
        [6, 0, true],  [6, 2, true],
        [8, 0, true],  [8, 2, true],
    ],
    10: [
        [0, 0, false], [0, 2, false],
        [1, 1, false],
        [3, 0, false], [3, 2, false],
        [5, 0, true],  [5, 2, true],
        [7, 1, true],
        [8, 0, true],  [8, 2, true],
    ],
};

function getPipCount(rank: string): number {
    const map: Record<string, number> = { '9': 9, '10': 10, 'A': 1 };
    return map[rank] ?? 0;
}

export const Card: React.FC<Props> = ({ card, onClick, selected, playable, hidden, isTrump }) => {
    const color = (card.suit === 'Hearts' || card.suit === 'Diamonds') ? 'red' : 'black';
    const symbol = suitSymbols[card.suit];
    const rankLabel = RANK_DISPLAY[card.rank] || card.rank;

    if (hidden) {
        return <div className="card back" />;
    }

    const pipCount = getPipCount(card.rank);
    const face = isFaceCard(card.rank);
    const positions = PIP_POSITIONS[pipCount];

    return (
        <div
            className={clsx('card', color, { selected, playable, trump: isTrump })}
            onClick={playable || selected !== undefined ? onClick : undefined}
        >
            <div className="card-inner">
                <div className="corner top-left">
                    <span className="corner-rank">{rankLabel}</span>
                    <span className="corner-suit">{symbol}</span>
                </div>

                <div className="card-body">
                    {face ? (
                        <div className="face-card-center">
                            <span className="face-letter">{FACE_LABELS[card.rank]}</span>
                            <span className="face-suit">{symbol}</span>
                        </div>
                    ) : positions ? (
                        <div className="pip-field">
                            {positions.map(([row, col, flip], i) => {
                                const top = `${(row / 8) * 100}%`;
                                const left = col === 0 ? '18%' : col === 1 ? '50%' : '82%';
                                return (
                                    <span
                                        key={i}
                                        className={clsx('pip', { flipped: flip })}
                                        style={{ top, left }}
                                    >
                                        {symbol}
                                    </span>
                                );
                            })}
                        </div>
                    ) : null}
                </div>

                <div className="corner bottom-right">
                    <span className="corner-rank">{rankLabel}</span>
                    <span className="corner-suit">{symbol}</span>
                </div>
            </div>
        </div>
    );
};
