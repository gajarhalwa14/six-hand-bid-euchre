import React from 'react';
import type { Card as CardType, Suit } from '../types';
import clsx from 'clsx';
import './Card.css';

interface Props {
    card: CardType;
    onClick?: () => void;
    selected?: boolean;
    playable?: boolean;
    hidden?: boolean; // Face down
    isTrump?: boolean;
}

const suitSymbols: Record<Suit, string> = {
    Spades: '♠',
    Hearts: '♥',
    Clubs: '♣',
    Diamonds: '♦'
};

export const Card: React.FC<Props> = ({ card, onClick, selected, playable, hidden, isTrump }) => {
    const color = (card.suit === 'Hearts' || card.suit === 'Diamonds') ? 'red' : 'black';

    if (hidden) {
        return (
            <div className="card back" />
        );
    }

    return (
        <div
            className={clsx('card', color, { selected, playable, trump: isTrump })}
            onClick={playable || selected !== undefined ? onClick : undefined}
        >
            <div className="corner top-left">
                <div>{card.rank}</div>
                <div>{suitSymbols[card.suit]}</div>
            </div>
            <div className="center">
                {suitSymbols[card.suit]}
            </div>
            <div className="corner bottom-right">
                <div>{card.rank}</div>
                <div>{suitSymbols[card.suit]}</div>
            </div>
        </div>
    );
};
