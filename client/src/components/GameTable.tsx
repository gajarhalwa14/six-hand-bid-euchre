import React, { useState, useMemo, useEffect } from 'react';
import type { GameState, Card as CardType, SeatSwapOffer } from '../types';
import { determineTrickWinner, getEffectiveSuit } from '@shared/CardUtils';
import { Card } from './Card';
import { Controls } from './Controls';
import { socket } from '../socket';
import './GameTable.css';

interface Props {
    gameState: GameState;
    myId: string;
    onLeave: () => void;
}

export const GameTable: React.FC<Props> = ({ gameState, myId, onLeave }) => {
    const myIndex = gameState.players.findIndex(p => p.id === myId);
    const myPlayer = gameState.players[myIndex];

    const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
    const [swapOffer, setSwapOffer] = useState<SeatSwapOffer | null>(null);
    const [swapMessage, setSwapMessage] = useState<string | null>(null);

    useEffect(() => {
        socket.on('seatSwapOffer', (offer) => setSwapOffer(offer));
        socket.on('seatSwapResult', (msg) => {
            setSwapMessage(msg);
            setTimeout(() => setSwapMessage(null), 3000);
        });
        return () => {
            socket.off('seatSwapOffer');
            socket.off('seatSwapResult');
        };
    }, []);

    const handleSwapRequest = (targetIndex: number) => {
        socket.emit('requestSeatSwap', targetIndex);
    };

    const handleSwapResponse = (accepted: boolean) => {
        if (swapOffer) {
            socket.emit('respondSeatSwap', swapOffer.fromPlayerIndex, accepted);
            setSwapOffer(null);
        }
    };

    const sortedHand = useMemo(() => {
        if (!myPlayer) return [];
        const trump = gameState.trump;

        const rankValues: Record<string, number> = { 'A': 6, 'K': 5, 'Q': 4, 'J': 3, '10': 2, '9': 1 };

        return [...myPlayer.hand].sort((a, b) => {
            const suitA = getEffectiveSuit(a, trump);
            const suitB = getEffectiveSuit(b, trump);

            // 1. Trump suit first
            if (trump) {
                const aIsTrump = suitA === trump;
                const bIsTrump = suitB === trump;
                if (aIsTrump && !bIsTrump) return -1;
                if (!aIsTrump && bIsTrump) return 1;
            }

            // 2. Group by suit
            if (suitA !== suitB) {
                return suitA.localeCompare(suitB);
            }

            // 3. Sort by rank descending
            const getVisualRank = (c: CardType, effSuit: string) => {
                if (trump && effSuit === trump && c.rank === 'J') {
                    if (c.suit === trump) return 8; // Right Bower
                    return 7; // Left Bower
                }
                return rankValues[c.rank];
            };

            return getVisualRank(b, suitB) - getVisualRank(a, suitA);
        });
    }, [myPlayer?.hand, gameState.trump]);

    const toggleSelect = (id: string) => {
        if (gameState.phase === 'TRICK_PLAY') {
            if (gameState.turnIndex === myIndex) {
                socket.emit('playCard', id);
            }
            return;
        }

        if (selectedCardIds.includes(id)) {
            setSelectedCardIds(selectedCardIds.filter(x => x !== id));
        } else {
            const limit = (gameState.phase === 'SHOOT_DISCARD') ? 2 : 1;
            if (selectedCardIds.length < limit) {
                setSelectedCardIds([...selectedCardIds, id]);
            }
        }
    };

    const POSITIONS = ['bottom', 'bottom-left', 'top-left', 'top', 'top-right', 'bottom-right'];

    // Calculate Tricks Taken
    const tricksA = gameState.tricksHistory.filter(t => gameState.players[t.winnerIndex!].team === 'A').length;
    const tricksB = gameState.tricksHistory.filter(t => gameState.players[t.winnerIndex!].team === 'B').length;

    // Determine winning card in current trick
    let winningCardIndex = -1;
    if (gameState.currentTrick.plays.length > 0) {
        winningCardIndex = determineTrickWinner(
            gameState.currentTrick.plays.map(p => p.card),
            gameState.currentTrick.leadSuit,
            gameState.trump,
            gameState.winningBid?.type || 'HIGH' // Fallback to HIGH if null (shouldn't happen in play)
        );
    }
    const winningPlay = winningCardIndex !== -1 ? gameState.currentTrick.plays[winningCardIndex] : null;

    return (
        <div className="table">
            {/* Back to Home */}
            <button className="back-home-btn" onClick={onLeave}>
                &larr; Leave Game
            </button>

            {/* Swap notification toast */}
            {swapMessage && <div className="swap-toast">{swapMessage}</div>}

            {/* Swap offer modal */}
            {swapOffer && (
                <div className="swap-offer-overlay">
                    <div className="swap-offer-modal">
                        <h3>Seat Swap Request</h3>
                        <p><strong>{swapOffer.fromPlayerName}</strong> wants to swap seats with you.</p>
                        <p>You will switch teams if you accept.</p>
                        <div className="swap-offer-actions">
                            <button className="btn-accept" onClick={() => handleSwapResponse(true)}>Accept</button>
                            <button className="btn-decline" onClick={() => handleSwapResponse(false)}>Decline</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Info HUD */}
            <div className="hud top-left-hud">
                <div>Room Code: <strong>{gameState.roomId}</strong></div>
                <div>Score Team A: {gameState.scores.A}</div>
                <div>Score Team B: {gameState.scores.B}</div>
                <div className="trick-stats">
                    <div>Tricks A: {tricksA}</div>
                    <div>Tricks B: {tricksB}</div>
                </div>
                <div className="team-legend">
                    <div className="legend-item"><div className="legend-color" style={{ background: '#90caf9' }}></div>Team A</div>
                    <div className="legend-item"><div className="legend-color" style={{ background: '#f48fb1' }}></div>Team B</div>
                </div>
                <div>Trump: {gameState.trump || (gameState.winningBid?.type === 'HIGH' ? 'High' : (gameState.winningBid?.type === 'LOW' ? 'Low' : '-'))}</div>
                {gameState.phase !== 'LOBBY' && gameState.phase !== 'BIDDING' && gameState.winningBid && gameState.declarerIndex !== null && (
                    <div className="contract-info">
                        <div>Contract: <strong>{gameState.winningBid.amount} {gameState.winningBid.type === 'SUIT' ? gameState.winningBid.suit : gameState.winningBid.type}</strong></div>
                        <div>Caller: <strong>Team {gameState.players[gameState.declarerIndex].team}</strong></div>
                    </div>
                )}
            </div>

            {/* Players & Seats */}
            {[0, 1, 2, 3, 4, 5].map((seatNum) => {
                const mySeat = myPlayer?.seatIndex ?? myIndex;
                const relIndex = (seatNum - mySeat + 6) % 6;
                const pos = POSITIONS[relIndex];

                const p = gameState.players.find(pl => pl.seatIndex === seatNum)
                    // Fallback for older states or public rooms before sorting
                    || (gameState.phase === 'LOBBY' && !gameState.isPrivate && seatNum < gameState.players.length ? gameState.players[seatNum] : undefined);

                if (!p) {
                    // Empty seat
                    if (gameState.phase === 'LOBBY' && gameState.isPrivate) {
                        return (
                            <div key={`empty-${seatNum}`} className={`player-seat ${pos} empty-seat`}>
                                <button className="claim-seat-btn" onClick={() => socket.emit('chooseSeat', seatNum)}>
                                    Sit Here
                                </button>
                            </div>
                        );
                    }
                    return null; // Don't render empty seats in game or public lobby
                }

                // Render occupant
                const isTurn = gameState.turnIndex !== -1 && gameState.players[gameState.turnIndex]?.id === p.id;
                const teamClass = `team-${p.team}`;
                const playerBid = gameState.bids.find(b => gameState.players[b.playerIndex]?.id === p.id);

                let bidText = null;
                if (gameState.phase === 'BIDDING' && playerBid) {
                    bidText = `${playerBid.amount} ${playerBid.type === 'SUIT' ? playerBid.suit : playerBid.type}`;
                }

                const canSwap = gameState.phase !== 'LOBBY'
                    && p.id !== myId
                    && !p.isBot
                    && myPlayer
                    && p.team !== myPlayer.team;

                const pIdx = gameState.players.findIndex(pl => pl.id === p.id);

                return (
                    <div key={p.id} className={`player-seat ${pos} ${isTurn ? 'turn' : ''} ${teamClass}`}>
                        <div className="avatar">
                            {p.name} {p.isBot ? '🤖' : ''} <br />({p.team})
                        </div>
                        {bidText && <div className="bid-bubble">{bidText}</div>}
                        {gameState.phase !== 'LOBBY' && <div className="hand-count">{p.hand.length} Cards</div>}
                        {gameState.declarerIndex !== null && gameState.players[gameState.declarerIndex]?.id === p.id && <div className="badge">Bidder</div>}
                        {canSwap && (
                            <button className="swap-btn" onClick={() => handleSwapRequest(pIdx)}>
                                Swap Seats
                            </button>
                        )}
                    </div>
                );
            })}

            {/* Center Trick */}
            <div className="trick-zone">
                {gameState.currentTrick.plays.map((play) => {
                    const relIndex = (play.playerIndex - myIndex + 6) % 6;
                    const isWinning = winningPlay && play.playerIndex === winningPlay.playerIndex;
                    const teamClass = gameState.players[play.playerIndex].team === 'A' ? 'team-A' : 'team-B';

                    // Add Winning class if it's the winning card
                    return (
                        <div key={play.card.id} className={`trick-card pos-${relIndex} ${teamClass} ${isWinning ? 'winning' : ''}`}>
                            <Card card={play.card} />
                        </div>
                    );
                })}
            </div>

            {/* My Hand */}
            <div className="my-hand">
                {sortedHand.map((card) => (
                    <Card
                        key={card.id}
                        card={card}
                        playable={gameState.phase === 'TRICK_PLAY' && gameState.turnIndex === myIndex}
                        selected={selectedCardIds.includes(card.id)}
                        onClick={() => toggleSelect(card.id)}
                        isTrump={gameState.trump ? getEffectiveSuit(card, gameState.trump) === gameState.trump : false}
                    />
                ))}
            </div>

            {/* Controls Overlay */}
            <div className="controls-overlay">
                <Controls gameState={gameState} myIndex={myIndex} selectedCardIds={selectedCardIds} />
            </div>

            {/* Lobby Waiting Overlay */}
            {gameState.phase === 'LOBBY' && (
                <div className="lobby-waiting-overlay">
                    <h2>Waiting for Players...</h2>
                    <p>{gameState.players.length} / 6 joined</p>

                    {gameState.isPrivate && (
                        <div className="room-code-display">
                            <span>Room Code:</span>
                            <strong>{gameState.roomId}</strong>
                        </div>
                    )}

                    {gameState.isPrivate && gameState.hostId === myId && (
                        <div className="host-controls">
                            <button className="btn-secondary" onClick={() => socket.emit('randomizeSeats')}>🎲 Randomize Seats</button>
                            <button
                                className="btn-primary"
                                onClick={() => socket.emit('startGame')}
                            >
                                🚀 Start Match
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
