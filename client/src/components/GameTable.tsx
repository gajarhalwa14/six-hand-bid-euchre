import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { GameState, Card as CardType, SeatSwapOffer, Suit } from '../types';
import { determineTrickWinner, getEffectiveSuit } from '@shared/CardUtils';
import { Card } from './Card';
import { Controls } from './Controls';
import { DealingAnimation } from './DealingAnimation';
import { socket } from '../socket';
import { getAvatarById, BOT_AVATAR } from '../avatars';
import { DEAL_STEP_MS, DEAL_EVENT_COUNT, cardsDealtToSeat } from '../dealAnimation';
import './GameTable.css';

const SUIT_SYMBOL: Record<string, string> = {
    Spades: '♠', Hearts: '♥', Clubs: '♣', Diamonds: '♦'
};

const SUIT_COLOR: Record<string, string> = {
    Spades: '#1a1a1a', Hearts: '#cc1111', Clubs: '#1a1a1a', Diamonds: '#cc1111'
};

const RANK_SORT: Record<string, number> = { 'A': 6, 'K': 5, 'Q': 4, 'J': 3, '10': 2, '9': 1 };

function sortHandCards(cards: CardType[], trump: Suit | null): CardType[] {
    return [...cards].sort((a, b) => {
        const suitA = getEffectiveSuit(a, trump);
        const suitB = getEffectiveSuit(b, trump);
        if (trump) {
            const aIsTrump = suitA === trump;
            const bIsTrump = suitB === trump;
            if (aIsTrump && !bIsTrump) return -1;
            if (!aIsTrump && bIsTrump) return 1;
        }
        if (suitA !== suitB) return suitA.localeCompare(suitB);
        const getVisualRank = (c: CardType, effSuit: string) => {
            if (trump && effSuit === trump && c.rank === 'J') {
                if (c.suit === trump) return 8;
                return 7;
            }
            return RANK_SORT[c.rank];
        };
        return getVisualRank(b, suitB) - getVisualRank(a, suitA);
    });
}

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
    const [collectingTrick, setCollectingTrick] = useState(false);
    const [dealStep, setDealStep] = useState(-1);
    const prevPhaseRef = useRef(gameState.phase);

    useEffect(() => {
        setSelectedCardIds([]);

        if (gameState.phase === 'TRICK_END' && prevPhaseRef.current === 'TRICK_PLAY') {
            const timer = setTimeout(() => setCollectingTrick(true), 800);
            return () => clearTimeout(timer);
        } else {
            setCollectingTrick(false);
        }
        prevPhaseRef.current = gameState.phase;
    }, [gameState.phase]);

    useEffect(() => {
        if (gameState.phase !== 'DEALING') {
            setDealStep(-1);
            return;
        }
        setDealStep(-1);
        let s = 0;
        const id = window.setInterval(() => {
            if (s >= DEAL_EVENT_COUNT) {
                window.clearInterval(id);
                return;
            }
            setDealStep(s);
            s++;
        }, DEAL_STEP_MS);
        return () => window.clearInterval(id);
    }, [gameState.phase, gameState.dealerIndex, gameState.roomId]);

    const clearSelection = () => setSelectedCardIds([]);

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

    const mySeat = myPlayer?.seatIndex ?? (myIndex >= 0 ? myIndex : -1);

    const sortedHand = useMemo(() => {
        if (!myPlayer) return [];
        return sortHandCards(myPlayer.hand, gameState.trump);
    }, [myPlayer?.hand, gameState.trump]);

    const dealingVisibleHand = useMemo(() => {
        if (!myPlayer || gameState.phase !== 'DEALING' || mySeat < 0) return [];
        const n = cardsDealtToSeat(gameState.dealerIndex, mySeat, dealStep);
        const slice = myPlayer.hand.slice(0, n);
        return sortHandCards(slice, null);
    }, [myPlayer?.hand, gameState.phase, gameState.dealerIndex, mySeat, dealStep]);

    const displayHand = gameState.phase === 'DEALING' ? dealingVisibleHand : sortedHand;

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

            {/* Scoreboard + Trump + Room Code - top left */}
            <div className="hud-panel">
                <div className="hud-room-row">
                    <span className="hud-room-label">Room</span>
                    <span className="hud-room-code">{gameState.roomId}</span>
                </div>

                <div className="hud-score-row">
                    <div className="hud-team">
                        <span className="sb-dot" style={{ background: '#5c9cef' }}></span>
                        <span className="hud-team-label">A</span>
                        <span className="hud-team-score">{gameState.scores.A}</span>
                    </div>
                    {gameState.phase !== 'LOBBY' && (
                        <div className="hud-tricks-row">
                            <span className="hud-trick-num">{tricksA}</span>
                            <span className="hud-trick-label">tricks</span>
                            <span className="hud-trick-num">{tricksB}</span>
                        </div>
                    )}
                    <div className="hud-team">
                        <span className="hud-team-score">{gameState.scores.B}</span>
                        <span className="hud-team-label">B</span>
                        <span className="sb-dot" style={{ background: '#e87196' }}></span>
                    </div>
                </div>

                {gameState.phase !== 'LOBBY' && (
                    <div className="hud-trump-row">
                        <span className="hud-trump-label">Trump</span>
                        {gameState.trump ? (
                            <span className="hud-trump-value" style={{ color: SUIT_COLOR[gameState.trump] || '#fff' }}>
                                {SUIT_SYMBOL[gameState.trump]}
                            </span>
                        ) : (
                            <span className="hud-trump-text">
                                {gameState.winningBid?.type === 'HIGH' ? 'High' : (gameState.winningBid?.type === 'LOW' ? 'Low' : '—')}
                            </span>
                        )}
                        {gameState.winningBid && gameState.declarerIndex !== null && gameState.phase !== 'BIDDING' && (
                            <span className="hud-contract-text">
                                {gameState.winningBid.amount}
                                {gameState.winningBid.type === 'SUIT' && gameState.winningBid.suit
                                    ? <span style={{ color: SUIT_COLOR[gameState.winningBid.suit] }}> {SUIT_SYMBOL[gameState.winningBid.suit]}</span>
                                    : ` ${gameState.winningBid.type}`}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Dealing Animation */}
            {gameState.phase === 'DEALING' && (
                <DealingAnimation dealerIndex={gameState.dealerIndex} myIndex={myIndex} currentStep={dealStep} />
            )}

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

                let bidText: React.ReactNode = null;
                if (gameState.phase === 'BIDDING' && playerBid) {
                    if (playerBid.type === 'SUIT' && playerBid.suit) {
                        const sym = SUIT_SYMBOL[playerBid.suit] || playerBid.suit;
                        const col = SUIT_COLOR[playerBid.suit] || '#000';
                        bidText = <>{playerBid.amount} <span style={{ color: col }}>{sym}</span></>;
                    } else {
                        bidText = `${playerBid.amount} ${playerBid.type}`;
                    }
                }

                const canSwap = gameState.phase !== 'LOBBY'
                    && p.id !== myId
                    && !p.isBot
                    && myPlayer
                    && p.team !== myPlayer.team;

                const pIdx = gameState.players.findIndex(pl => pl.id === p.id);

                const avatarDef = p.isBot ? BOT_AVATAR : getAvatarById(p.avatarId);

                return (
                    <div key={p.id} className={`player-seat ${pos} ${isTurn ? 'turn' : ''} ${teamClass}`}>
                        <div className="avatar" style={avatarDef ? { background: avatarDef.bg } : undefined}>
                            <span className="avatar-emoji">{avatarDef ? avatarDef.emoji : p.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="player-name">{p.name} {p.isBot ? '🤖' : ''}</div>
                        {bidText && <div className="bid-bubble">{bidText}</div>}
                        {gameState.phase !== 'LOBBY' && <div className="hand-count">{p.hand.length}</div>}
                        {gameState.declarerIndex !== null && gameState.players[gameState.declarerIndex]?.id === p.id && <div className="badge">Bidder</div>}
                        {canSwap && (
                            <button className="swap-btn" onClick={() => handleSwapRequest(pIdx)}>
                                Swap
                            </button>
                        )}
                    </div>
                );
            })}

            {/* Center Trick */}
            <div className="trick-zone">
                {gameState.currentTrick.plays.map((play) => {
                    const relIndex = (play.playerIndex - (myIndex >= 0 ? myIndex : 0) + 6) % 6;
                    const isWinning = winningPlay && play.playerIndex === winningPlay.playerIndex;
                    const teamClass = gameState.players[play.playerIndex].team === 'A' ? 'team-A' : 'team-B';

                    const winnerIdx = gameState.currentTrick.winnerIndex;
                    const winnerRel = winnerIdx !== null ? (winnerIdx - (myIndex >= 0 ? myIndex : 0) + 6) % 6 : -1;

                    return (
                        <div
                            key={play.card.id}
                            className={`trick-card pos-${relIndex} ${teamClass} ${isWinning ? 'winning' : ''} ${collectingTrick ? 'collecting' : ''}`}
                            style={collectingTrick && winnerRel >= 0 ? {
                                '--collect-target': winnerRel,
                            } as React.CSSProperties : undefined}
                            data-collect-target={winnerRel}
                        >
                            <Card card={play.card} />
                        </div>
                    );
                })}
            </div>

            {/* My Hand */}
            <div className="my-hand">
                {displayHand.map((card) => (
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
                <Controls gameState={gameState} myIndex={myIndex} selectedCardIds={selectedCardIds} onAction={clearSelection} />
            </div>

            {/* Game Over Overlay */}
            {gameState.phase === 'GAME_OVER' && (
                <div className="game-over-overlay">
                    <div className="game-over-modal">
                        <h1 className="game-over-title">Game Over</h1>
                        <div className="game-over-scores">
                            <div className={`team-score ${gameState.scores.A >= 32 ? 'winner' : ''}`}>
                                <span className="team-label">Team A</span>
                                <span className="team-points">{gameState.scores.A}</span>
                                {gameState.scores.A >= 32 && <span className="winner-badge">Winner!</span>}
                            </div>
                            <div className="vs-divider">vs</div>
                            <div className={`team-score ${gameState.scores.B >= 32 ? 'winner' : ''}`}>
                                <span className="team-label">Team B</span>
                                <span className="team-points">{gameState.scores.B}</span>
                                {gameState.scores.B >= 32 && <span className="winner-badge">Winner!</span>}
                            </div>
                        </div>
                        <div className="game-over-actions">
                            <button className="btn-primary play-again-btn" onClick={() => socket.emit('playAgain')}>
                                Play Again
                            </button>
                            <button className="btn-secondary leave-btn" onClick={onLeave}>
                                Leave Game
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bot Takeover Overlay */}
            {gameState.phase !== 'LOBBY' && gameState.phase !== 'GAME_OVER' && myIndex === -1 && (
                <div className="bot-takeover-overlay">
                    <div className="bot-takeover-modal">
                        <h2>Game In Progress</h2>
                        <p>Select a bot to take their seat:</p>
                        <div className="bot-list">
                            {gameState.players.map((p, i) =>
                                p.isBot ? (
                                    <button key={p.id} className={`bot-option team-${p.team}-badge`} onClick={() => {
                                        console.log('[takeOverBot] Emitting for index', i, 'socket connected:', socket.connected);
                                        if (!socket.connected) {
                                            socket.connect();
                                        }
                                        socket.emit('takeOverBot', i);
                                    }}>
                                        <span className="bot-seat-info">Seat {(p.seatIndex ?? i) + 1} - Team {p.team}</span>
                                        <span className="bot-name">{p.name}</span>
                                    </button>
                                ) : null
                            )}
                        </div>
                        <button className="btn-secondary" onClick={onLeave} style={{ marginTop: '16px' }}>
                            Leave
                        </button>
                    </div>
                </div>
            )}

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

                    <div className="lobby-player-list">
                        {gameState.players.map((p) => (
                            <div key={p.id} className={`lobby-player-item team-${p.team}-badge`}>
                                <span className="lobby-player-name">
                                    {p.name} {p.id === myId ? '(You)' : ''} {p.isBot ? '🤖' : ''}
                                </span>
                                <span className="lobby-player-team">Team {p.team}</span>
                            </div>
                        ))}
                        {Array.from({ length: 6 - gameState.players.length }).map((_, i) => (
                            <div key={`empty-${i}`} className="lobby-player-item empty">
                                <span className="lobby-player-name">Waiting...</span>
                            </div>
                        ))}
                    </div>

                    {gameState.isPrivate && gameState.hostId === myId && (
                        <div className="host-controls">
                            <button className="btn-secondary" onClick={() => socket.emit('randomizeSeats')}>Randomize Seats</button>
                            <button
                                className="btn-primary"
                                onClick={() => socket.emit('startGame')}
                            >
                                Start Match
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
