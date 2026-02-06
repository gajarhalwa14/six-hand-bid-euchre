import React, { useState } from 'react';
import type { GameState, Suit } from '../types';
import { socket } from '../socket';
import clsx from 'clsx';
import './Controls.css';

interface Props {
    gameState: GameState;
    myIndex: number;
    selectedCardIds: string[];
}

const SUITS: Suit[] = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];

export const Controls: React.FC<Props> = ({ gameState, myIndex, selectedCardIds }) => {
    // const isMyTurn = gameState.currentBidderIndex === myIndex || gameState.turnIndex === myIndex;

    // Bidding State
    const [bidAmount, setBidAmount] = useState<number>(3); // 3-8, 9=Shoot, 10=Alone
    const [bidType, setBidType] = useState<'SUIT' | 'HIGH' | 'LOW'>('SUIT');
    const [bidSuit, setBidSuit] = useState<Suit>('Spades');

    if (gameState.phase === 'BIDDING') {
        if (gameState.currentBidderIndex !== myIndex) {
            return <div className="panel">Waiting for {gameState.players[gameState.currentBidderIndex]?.name} to bid...</div>;
        }

        const submitBid = () => {
            // Construct Bid Object
            // Convert to type safe
            if (bidType === 'SUIT') {
                socket.emit('bid', { amount: bidAmount, type: 'SUIT', suit: bidSuit, playerIndex: myIndex });
            } else {
                socket.emit('bid', { amount: bidAmount, type: bidType, playerIndex: myIndex });
            }
        };

        return (
            <div className="panel bidding-panel">
                <h3>Place Your Bid</h3>
                <div className="row">
                    <label>Amount:</label>
                    {[3, 4, 5, 6, 7, 8].map(n => (
                        <button key={n} onClick={() => setBidAmount(n)} className={clsx({ active: bidAmount === n })}>{n}</button>
                    ))}
                    <button onClick={() => setBidAmount(9)} className={clsx({ active: bidAmount === 9 })}>Shoot</button>
                    <button onClick={() => setBidAmount(10)} className={clsx({ active: bidAmount === 10 })}>Alone</button>
                </div>

                <div className="row">
                    <label>Type:</label>
                    <button onClick={() => setBidType('SUIT')} className={clsx({ active: bidType === 'SUIT' })}>Suit</button>
                    <button onClick={() => setBidType('HIGH')} className={clsx({ active: bidType === 'HIGH' })}>High</button>
                    <button onClick={() => setBidType('LOW')} className={clsx({ active: bidType === 'LOW' })}>Low</button>
                </div>

                {bidType === 'SUIT' && (
                    <div className="row">
                        <label>Suit:</label>
                        {SUITS.map(s => (
                            <button key={s} onClick={() => setBidSuit(s)} className={clsx({ active: bidSuit === s })}>{s}</button>
                        ))}
                    </div>
                )}

                <div className="actions">
                    <button className="pass-btn" onClick={() => socket.emit('inputPassBid')}>Pass</button>
                    <button className="bid-btn" onClick={submitBid}>Submit Bid</button>
                </div>

                <div className="current-high">
                    Current High: {gameState.winningBid ? `${gameState.winningBid.amount} (${gameState.winningBid.type} ${gameState.winningBid.suit || ''})` : 'None'}
                </div>
            </div>
        );
    }

    if (gameState.phase === 'SHOOT_DISCARD') {
        if (gameState.declarerIndex === myIndex) {
            return (
                <div className="panel">
                    <h3>Discard 2 Cards</h3>
                    <p>Selected: {selectedCardIds.length}/2</p>
                    <button
                        disabled={selectedCardIds.length !== 2}
                        onClick={() => socket.emit('discardCards', selectedCardIds)}
                    >
                        Confirm Discard
                    </button>
                </div>
            );
        }
        return <div className="panel">Waiting for Shooter to discard...</div>;
    }

    if (gameState.phase === 'SHOOT_PASS') {
        if (gameState.shootPassWaitList.includes(myIndex)) {
            return (
                <div className="panel">
                    <h3>Pass Best Card to Shooter</h3>
                    <p>Select 1 card</p>
                    <button
                        disabled={selectedCardIds.length !== 1}
                        onClick={() => socket.emit('passCard', selectedCardIds[0])}
                    >
                        Pass Card
                    </button>
                </div>
            );
        }
        return <div className="panel">Waiting for partners to pass cards...</div>;
    }

    if (gameState.phase === 'TRICK_PLAY') {
        if (gameState.turnIndex === myIndex) {
            return <div className="panel active-turn">YOUR TURN</div>;
        }
        const activePlayer = gameState.players[gameState.turnIndex]?.name;
        return <div className="panel">Waiting for {activePlayer}...</div>;
    }

    return null;
};
