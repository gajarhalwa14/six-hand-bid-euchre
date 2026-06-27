import React, { useState } from 'react';
import type { GameState, Suit } from '../types';
import { socket } from '../socket';
import clsx from 'clsx';
import {
    shouldConcealShootBidFromViewer,
    getShootLabelForAmount,
    isShootBidAmount,
} from '@shared/bidUtils';
import './Controls.css';

interface Props {
    gameState: GameState;
    myIndex: number;
    selectedCardIds: string[];
    onAction: () => void;
}

const SUITS: Suit[] = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];

const SUIT_SYMBOL: Record<Suit, string> = {
    Spades: '♠', Hearts: '♥', Clubs: '♣', Diamonds: '♦'
};

const SUIT_COLOR: Record<Suit, string> = {
    Spades: '#1a1a1a', Hearts: '#cc1111', Clubs: '#1a1a1a', Diamonds: '#cc1111'
};

export const Controls: React.FC<Props> = ({ gameState, myIndex, selectedCardIds, onAction }) => {
    const isMegaDraft = gameState.gameMode === 'MEGA_DRAFT';
    const shootDiscardCount = isMegaDraft && gameState.winningBid?.amount === 10 ? 1 : 2;

    const [bidAmount, setBidAmount] = useState<number>(3);
    const [bidType, setBidType] = useState<'SUIT' | 'HIGH' | 'LOW'>('SUIT');
    const [bidSuit, setBidSuit] = useState<Suit>('Spades');
    const [pendingBidConfirm, setPendingBidConfirm] = useState<string | null>(null);

    const formatBidLabel = (amount: number, type: 'SUIT' | 'HIGH' | 'LOW', suit?: Suit): string => {
        if (isShootBidAmount(amount, gameState.gameMode)) {
            return getShootLabelForAmount(amount, gameState.gameMode);
        }
        if (amount === 10 && !isMegaDraft) return 'Alone';
        if (amount === 11 && isMegaDraft) return 'Alone';
        if (type === 'SUIT' && suit) return `${amount} ${SUIT_SYMBOL[suit]}`;
        return `${amount} ${type}`;
    };

    const formatBidFromState = (bid: NonNullable<GameState['winningBid']>): React.ReactNode => {
        if (shouldConcealShootBidFromViewer(bid, gameState.gameMode, gameState.phase, myIndex)) {
            return getShootLabelForAmount(bid.amount, gameState.gameMode);
        }
        if (isShootBidAmount(bid.amount, gameState.gameMode)) {
            return getShootLabelForAmount(bid.amount, gameState.gameMode);
        }
        if (bid.type === 'SUIT' && bid.suit) {
            return (
                <>
                    {bid.amount}{' '}
                    <span style={{ color: SUIT_COLOR[bid.suit] }}>{SUIT_SYMBOL[bid.suit]}</span>
                </>
            );
        }
        return `${bid.amount} ${bid.type}`;
    };

    if (gameState.phase === 'BIDDING') {
        if (gameState.currentBidderIndex !== myIndex) {
            const bidder = gameState.players[gameState.currentBidderIndex];
            return (
                <div className="panel waiting-panel">
                    <div className="waiting-indicator">
                        <div className="waiting-dot"></div>
                        <div className="waiting-dot"></div>
                        <div className="waiting-dot"></div>
                    </div>
                    <span>Waiting for <strong>{bidder?.name}</strong> to bid</span>
                </div>
            );
        }

        const submitBid = () => {
            setPendingBidConfirm(formatBidLabel(bidAmount, bidType, bidType === 'SUIT' ? bidSuit : undefined));
        };

        const confirmBid = () => {
            if (bidType === 'SUIT') {
                socket.emit('bid', { amount: bidAmount, type: 'SUIT', suit: bidSuit, playerIndex: myIndex });
            } else {
                socket.emit('bid', { amount: bidAmount, type: bidType, playerIndex: myIndex });
            }
            setPendingBidConfirm(null);
        };

        const currentHigh = gameState.winningBid;
        const minBid = currentHigh ? currentHigh.amount + 1 : 3;

        const previousBids = gameState.bids.filter(b => b.playerIndex !== myIndex);

        return (
            <div className="panel bidding-panel">
                {pendingBidConfirm && (
                    <div className="bid-confirm-overlay" role="dialog" aria-modal="true">
                        <div className="bid-confirm-modal">
                            <p className="bid-confirm-text">
                                You are bidding: <strong>{pendingBidConfirm}</strong>
                            </p>
                            <p className="bid-confirm-sub">Confirm this bid?</p>
                            <div className="bid-confirm-actions">
                                <button className="bid-confirm-cancel" onClick={() => setPendingBidConfirm(null)}>
                                    Cancel
                                </button>
                                <button className="bid-confirm-ok" onClick={confirmBid}>
                                    Confirm
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <h3 className="panel-title">Place Your Bid</h3>

                {previousBids.length > 0 && (
                    <div className="bid-history">
                        {previousBids.map((b, idx) => {
                            const pName = gameState.players[b.playerIndex]?.name || '?';
                            const concealed = shouldConcealShootBidFromViewer(b, gameState.gameMode, gameState.phase, myIndex);
                            const bLabel = b.amount === 0 ? 'Pass'
                                : concealed
                                    ? getShootLabelForAmount(b.amount, gameState.gameMode)
                                    : b.type === 'SUIT' && b.suit
                                        ? <>{b.amount} <span style={{ color: SUIT_COLOR[b.suit as Suit] }}>{SUIT_SYMBOL[b.suit as Suit]}</span></>
                                        : isShootBidAmount(b.amount, gameState.gameMode)
                                            ? getShootLabelForAmount(b.amount, gameState.gameMode)
                                            : `${b.amount} ${b.type}`;
                            return (
                                <span key={idx} className="bid-history-item">
                                    <span className="bid-history-name">{pName}</span>: {b.amount === 0 ? 'Pass' : bLabel}
                                </span>
                            );
                        })}
                    </div>
                )}

                <div className="bid-section">
                    <label className="section-label">Amount</label>
                    <div className="btn-group">
                        {[3, 4, 5, 6, 7, 8].map(n => (
                            <button
                                key={n}
                                onClick={() => setBidAmount(n)}
                                className={clsx('bid-num-btn', { active: bidAmount === n })}
                                disabled={n < minBid}
                            >{n}</button>
                        ))}
                        <button
                            onClick={() => setBidAmount(9)}
                            className={clsx('bid-special-btn', { active: bidAmount === 9 })}
                            disabled={9 < minBid}
                        >Shoot</button>
                        {isMegaDraft ? (
                            <>
                                <button
                                    onClick={() => setBidAmount(10)}
                                    className={clsx('bid-special-btn', { active: bidAmount === 10 })}
                                    disabled={10 < minBid}
                                >1-Card Shoot</button>
                                <button
                                    onClick={() => setBidAmount(11)}
                                    className={clsx('bid-special-btn', { active: bidAmount === 11 })}
                                    disabled={11 < minBid}
                                >Alone</button>
                            </>
                        ) : (
                            <button
                                onClick={() => setBidAmount(10)}
                                className={clsx('bid-special-btn', { active: bidAmount === 10 })}
                                disabled={10 < minBid}
                            >Alone</button>
                        )}
                    </div>
                </div>

                <div className="bid-section">
                    <label className="section-label">Type</label>
                    <div className="btn-group">
                        <button onClick={() => setBidType('SUIT')} className={clsx('bid-type-btn', { active: bidType === 'SUIT' })}>
                            <span className="suit-icon" style={{ color: SUIT_COLOR[bidSuit] }}>{SUIT_SYMBOL[bidSuit]}</span> Suit
                        </button>
                        <button onClick={() => setBidType('HIGH')} className={clsx('bid-type-btn', { active: bidType === 'HIGH' })}>High</button>
                        <button onClick={() => setBidType('LOW')} className={clsx('bid-type-btn', { active: bidType === 'LOW' })}>Low</button>
                    </div>
                </div>

                {bidType === 'SUIT' && (
                    <div className="bid-section">
                        <label className="section-label">Suit</label>
                        <div className="btn-group suit-group">
                            {SUITS.map(s => (
                                <button
                                    key={s}
                                    onClick={() => setBidSuit(s)}
                                    className={clsx('suit-btn', { active: bidSuit === s })}
                                    style={{ color: bidSuit === s ? '#fff' : SUIT_COLOR[s] }}
                                >
                                    <span className="suit-btn-symbol">{SUIT_SYMBOL[s]}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="bid-actions">
                    <button className="pass-btn" onClick={() => socket.emit('inputPassBid')}>Pass</button>
                    <button className="submit-bid-btn" onClick={submitBid} disabled={bidAmount < minBid}>Submit Bid</button>
                </div>

                <div className="current-high-bar">
                    Current Bid: <strong>{currentHigh ? formatBidFromState(currentHigh) : 'None'}</strong>
                </div>
            </div>
        );
    }

    if (gameState.phase === 'PRE_BID_DISCARD') {
        if (gameState.preBidDiscardWaitList.includes(myIndex)) {
            return (
                <div className="panel action-panel">
                    <h3 className="panel-title">Discard 4 Cards</h3>
                    <div className="selection-indicator">
                        <div className={clsx('sel-dot', { filled: selectedCardIds.length >= 1 })} />
                        <div className={clsx('sel-dot', { filled: selectedCardIds.length >= 2 })} />
                        <div className={clsx('sel-dot', { filled: selectedCardIds.length >= 3 })} />
                        <div className={clsx('sel-dot', { filled: selectedCardIds.length >= 4 })} />
                    </div>
                    <button
                        className="confirm-btn"
                        disabled={selectedCardIds.length !== 4}
                        onClick={() => { socket.emit('discardCards', selectedCardIds); onAction(); }}
                    >
                        Confirm Discard
                    </button>
                </div>
            );
        }
        return (
            <div className="panel waiting-panel">
                <div className="waiting-indicator"><div className="waiting-dot"></div><div className="waiting-dot"></div><div className="waiting-dot"></div></div>
                <span>Waiting for all players to discard 4 cards</span>
            </div>
        );
    }

    if (gameState.phase === 'SHOOT_DISCARD') {
        if (gameState.declarerIndex === myIndex) {
            return (
                <div className="panel action-panel">
                    <h3 className="panel-title">Discard {shootDiscardCount} {shootDiscardCount === 1 ? 'Card' : 'Cards'}</h3>
                    <div className="selection-indicator">
                        <div className={clsx('sel-dot', { filled: selectedCardIds.length >= 1 })} />
                        {shootDiscardCount === 2 && <div className={clsx('sel-dot', { filled: selectedCardIds.length >= 2 })} />}
                    </div>
                    <button
                        className="confirm-btn"
                        disabled={selectedCardIds.length !== shootDiscardCount}
                        onClick={() => { socket.emit('discardCards', selectedCardIds); onAction(); }}
                    >
                        Confirm Discard
                    </button>
                </div>
            );
        }
        return (
            <div className="panel waiting-panel">
                <div className="waiting-indicator"><div className="waiting-dot"></div><div className="waiting-dot"></div><div className="waiting-dot"></div></div>
                <span>Waiting for Shooter to discard</span>
            </div>
        );
    }

    if (gameState.phase === 'SHOOT_PASS') {
        if (gameState.shootPassWaitList.includes(myIndex)) {
            return (
                <div className="panel action-panel">
                    <h3 className="panel-title">Pass Best Card to Shooter</h3>
                    <div className="selection-indicator">
                        <div className={clsx('sel-dot', { filled: selectedCardIds.length >= 1 })} />
                    </div>
                    <button
                        className="confirm-btn"
                        disabled={selectedCardIds.length !== 1}
                        onClick={() => { socket.emit('passCard', selectedCardIds[0]); onAction(); }}
                    >
                        Pass Card
                    </button>
                </div>
            );
        }
        return (
            <div className="panel waiting-panel">
                <div className="waiting-indicator"><div className="waiting-dot"></div><div className="waiting-dot"></div><div className="waiting-dot"></div></div>
                <span>Waiting for partners to pass cards</span>
            </div>
        );
    }

    if (gameState.phase === 'TRICK_PLAY') {
        if (gameState.turnIndex === myIndex) {
            const lead = gameState.currentTrick.leadSuit;
            const canTRAM = !!gameState.canClaimRest;
            return (
                <div className="panel your-turn-panel">
                    <div>Your Turn — Pick a Card</div>
                    <div className="lead-suit-hint">Keys: 1-8 or Arrow keys to hover, Enter (or same number) plays</div>
                    {lead ? (
                        <div className="lead-suit-hint">
                            Lead suit:{' '}
                            <span className="lead-suit-symbol" style={{ color: SUIT_COLOR[lead] }}>
                                {SUIT_SYMBOL[lead]} {lead}
                            </span>
                        </div>
                    ) : (
                        <div className="lead-suit-hint lead-suit-hint--lead">You lead — play any card</div>
                    )}
                    {canTRAM && (
                        <button
                            className="tram-btn"
                            onClick={() => {
                                if (window.confirm("Claim all remaining tricks? This is only allowed if you can guarantee winning every one.")) {
                                    socket.emit('claimRest');
                                }
                            }}
                            title="The Rest Are Mine — claim all remaining tricks"
                        >
                            🏆 The Rest Are Mine
                        </button>
                    )}
                </div>
            );
        }
        const activePlayer = gameState.players[gameState.turnIndex]?.name;
        return (
            <div className="panel waiting-panel">
                <div className="waiting-indicator"><div className="waiting-dot"></div><div className="waiting-dot"></div><div className="waiting-dot"></div></div>
                <span>Waiting for <strong>{activePlayer}</strong></span>
            </div>
        );
    }

    return null;
};
