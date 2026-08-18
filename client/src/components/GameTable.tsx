import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import type { GameState, Card as CardType, Suit, ChatMessage, SpectatorSwapOffer } from '../types';
import { determineTrickWinner, getEffectiveSuit, isLegalPlay } from '@shared/CardUtils';
import {
    isShootBidAmount,
    shouldConcealShootBid,
    shouldConcealShootBidFromViewer,
    getShootLabelForAmount,
} from '@shared/bidUtils';
import { Card } from './Card';
import { Controls } from './Controls';
import { DealingAnimation } from './DealingAnimation';
import { socket } from '../socket';
import { getAvatarById, BOT_AVATAR } from '../avatars';
import { DEAL_STEP_MS, getDealEventCount, cardsDealtToSeat } from '../dealAnimation';
import './GameTable.css';

const SUIT_SYMBOL: Record<string, string> = {
    Spades: '♠', Hearts: '♥', Clubs: '♣', Diamonds: '♦'
};

const SUIT_COLOR: Record<string, string> = {
    Spades: '#1a1a1a', Hearts: '#cc1111', Clubs: '#1a1a1a', Diamonds: '#cc1111'
};

// Same suits, but tuned for the dark HUD background. The original near-black
// values are unreadable on dark, so use white for black suits and a brighter
// red for hearts/diamonds.
const HUD_SUIT_COLOR: Record<string, string> = {
    Spades: '#ffffff', Hearts: '#ff5b6b', Clubs: '#ffffff', Diamonds: '#ff5b6b'
};

const RANK_SORT: Record<string, number> = { 'A': 6, 'K': 5, 'Q': 4, 'J': 3, '10': 2, '9': 1 };

function isShootBid(gameState: GameState): boolean {
    const amount = gameState.winningBid?.amount;
    if (amount === undefined) return false;
    return isShootBidAmount(amount, gameState.gameMode);
}

function getShootLabel(gameState: GameState): string {
    if (!gameState.winningBid) return 'Shoot';
    return getShootLabelForAmount(gameState.winningBid.amount, gameState.gameMode);
}

function shouldHideTrumpHud(gameState: GameState, myIndex: number): boolean {
    if (!gameState.winningBid || gameState.declarerIndex === null) return false;
    if (!shouldConcealShootBid(gameState.phase)) return false;
    if (!isShootBidAmount(gameState.winningBid.amount, gameState.gameMode)) return false;
    return myIndex !== gameState.declarerIndex;
}

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
    const playerCount = gameState.gameMode === 'MEGA_DRAFT' ? 4 : 6;
    const maxDiscardSelection = gameState.phase === 'PRE_BID_DISCARD'
        ? 4
        : (gameState.phase === 'SHOOT_DISCARD'
            ? (gameState.winningBid?.amount === 11 ? 1 : 2)
            : 1);

    const myIndex = gameState.players.findIndex(p => p.id === myId);
    const myPlayer = gameState.players[myIndex];

    const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
    const [queuedPremoveCardId, setQueuedPremoveCardId] = useState<string | null>(null);
    const [collectingTrick, setCollectingTrick] = useState(false);
    const [dealStep, setDealStep] = useState(-1);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    // Default to minimized on small screens so chat doesn't cover the table
    const isInitiallyMobile = typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
    const [chatMinimized, setChatMinimized] = useState(isInitiallyMobile);
    const [chatPos, setChatPos] = useState<{ x: number; y: number } | null>(null);
    const [draggingChat, setDraggingChat] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [chatFlash, setChatFlash] = useState(false);
    const [hoveredCardIndex, setHoveredCardIndex] = useState<number | null>(null);
    const [pendingSwapOffer, setPendingSwapOffer] = useState<SpectatorSwapOffer | null>(null);
    const [swapToast, setSwapToast] = useState<string | null>(null);
    const swapToastTimeoutRef = useRef<number | null>(null);
    const chatMessagesRef = useRef<HTMLDivElement | null>(null);
    const chatPanelRef = useRef<HTMLDivElement | null>(null);
    const dragStartRef = useRef<{ pointerX: number; pointerY: number; startX: number; startY: number } | null>(null);
    const flashTimeoutRef = useRef<number | null>(null);
    const chatMinimizedRef = useRef(chatMinimized);
    const prevPhaseRef = useRef(gameState.phase);

    useEffect(() => { chatMinimizedRef.current = chatMinimized; }, [chatMinimized]);

    useEffect(() => {
        setSelectedCardIds([]);
        setQueuedPremoveCardId(null);

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
        const maxEvents = getDealEventCount(playerCount);
        const id = window.setInterval(() => {
            if (s >= maxEvents) {
                window.clearInterval(id);
                return;
            }
            setDealStep(s);
            s++;
        }, DEAL_STEP_MS);
        return () => window.clearInterval(id);
    }, [gameState.phase, gameState.dealerIndex, gameState.roomId, playerCount]);

    const clearSelection = () => setSelectedCardIds([]);

    useEffect(() => {
        socket.on('chatHistory', (messages) => {
            setChatMessages(messages);
        });
        socket.on('chatMessage', (message) => {
            setChatMessages(prev => [...prev, message]);
            // Notify on incoming messages from others (not your own)
            if (message.senderId !== myId) {
                setChatFlash(true);
                if (flashTimeoutRef.current !== null) {
                    window.clearTimeout(flashTimeoutRef.current);
                }
                flashTimeoutRef.current = window.setTimeout(() => setChatFlash(false), 1400);
                // Only count as unread when the chat is currently minimized
                if (chatMinimizedRef.current) {
                    setUnreadCount(c => c + 1);
                }
            }
        });
        return () => {
            socket.off('chatHistory');
            socket.off('chatMessage');
        };
    }, [myId]);

    // Spectator <-> player swap offer/response side channels.
    useEffect(() => {
        const onOffer = (offer: SpectatorSwapOffer) => {
            // Stash the offer so we render a modal; spectator chooses Accept/Decline.
            setPendingSwapOffer(offer);
        };
        const onResult = (msg: string) => {
            // Brief toast in the corner. Clears any prior toast cleanly.
            setSwapToast(msg);
            if (swapToastTimeoutRef.current !== null) {
                window.clearTimeout(swapToastTimeoutRef.current);
            }
            swapToastTimeoutRef.current = window.setTimeout(() => setSwapToast(null), 3500);
        };
        socket.on('spectatorSwapOffer', onOffer);
        socket.on('spectatorSwapResult', onResult);
        return () => {
            socket.off('spectatorSwapOffer', onOffer);
            socket.off('spectatorSwapResult', onResult);
        };
    }, []);

    const respondToSwap = (accepted: boolean) => {
        if (!pendingSwapOffer) return;
        socket.emit('respondSpectatorSwap', pendingSwapOffer.fromPlayerId, accepted);
        setPendingSwapOffer(null);
    };

    const askToSwapWithSpectator = (spectatorId: string, spectatorName: string) => {
        if (!window.confirm(`Offer your seat to ${spectatorName}? They'll need to accept.`)) return;
        socket.emit('requestSwapWithSpectator', spectatorId);
    };

    // Reset unread count when chat is opened
    useEffect(() => {
        if (!chatMinimized) {
            setUnreadCount(0);
        }
    }, [chatMinimized]);

    // Scroll chat to bottom whenever messages change AND when chat is reopened
    useLayoutEffect(() => {
        if (chatMinimized) return;
        const el = chatMessagesRef.current;
        if (el) {
            el.scrollTop = el.scrollHeight;
        }
    }, [chatMessages, chatMinimized]);

    // Initialize / re-clamp chat panel position so it always fits in the viewport.
    // Runs on mount and whenever the chat is expanded/minimized (which changes its size).
    useLayoutEffect(() => {
        const panel = chatPanelRef.current;
        if (!panel) return;
        const isMobile = window.matchMedia('(max-width: 768px)').matches;

        // Defer to next frame so the panel reflects the new minimized state.
        const id = window.requestAnimationFrame(() => {
            const w = panel.offsetWidth;
            const h = panel.offsetHeight;
            const maxX = Math.max(8, window.innerWidth - w - 8);
            const maxY = Math.max(8, window.innerHeight - h - 8);

            setChatPos(prev => {
                if (prev === null) {
                    // First-time positioning
                    if (isMobile) {
                        return { x: 8, y: maxY };
                    }
                    return { x: maxX, y: 56 };
                }
                return { x: Math.min(prev.x, maxX), y: Math.min(prev.y, maxY) };
            });
        });
        return () => window.cancelAnimationFrame(id);
    }, [chatMinimized]);

    // Keep chat in viewport when window resizes
    useEffect(() => {
        const onResize = () => {
            const panel = chatPanelRef.current;
            if (!panel) return;
            const w = panel.offsetWidth;
            const h = panel.offsetHeight;
            const maxX = Math.max(8, window.innerWidth - w - 8);
            const maxY = Math.max(8, window.innerHeight - h - 8);
            setChatPos(prev => prev
                ? { x: Math.min(prev.x, maxX), y: Math.min(prev.y, maxY) }
                : prev);
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        if (!draggingChat) return;

        const move = (clientX: number, clientY: number) => {
            const start = dragStartRef.current;
            if (!start) return;
            const dx = clientX - start.pointerX;
            const dy = clientY - start.pointerY;
            const panel = chatPanelRef.current;
            const w = panel?.offsetWidth ?? 280;
            const h = panel?.offsetHeight ?? 60;
            const maxX = Math.max(8, window.innerWidth - w - 8);
            const maxY = Math.max(8, window.innerHeight - h - 8);
            const x = Math.min(maxX, Math.max(8, start.startX + dx));
            const y = Math.min(maxY, Math.max(8, start.startY + dy));
            setChatPos({ x, y });
        };

        const onMouseMove = (e: MouseEvent) => move(e.clientX, e.clientY);
        const onTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 0) return;
            move(e.touches[0].clientX, e.touches[0].clientY);
            e.preventDefault();
        };
        const onUp = () => {
            setDraggingChat(false);
            dragStartRef.current = null;
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onUp);
        };
    }, [draggingChat]);

    const submitChat = (e: React.FormEvent) => {
        e.preventDefault();
        const text = chatInput.trim();
        if (!text) return;
        socket.emit('sendChatMessage', text);
        setChatInput('');
    };

    const onChatHeaderMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest('.chat-min-btn')) return;
        if (!chatPos) return;
        dragStartRef.current = {
            pointerX: e.clientX,
            pointerY: e.clientY,
            startX: chatPos.x,
            startY: chatPos.y
        };
        setDraggingChat(true);
    };

    const onChatHeaderTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
        if ((e.target as HTMLElement).closest('.chat-min-btn')) return;
        if (!chatPos || e.touches.length === 0) return;
        const touch = e.touches[0];
        dragStartRef.current = {
            pointerX: touch.clientX,
            pointerY: touch.clientY,
            startX: chatPos.x,
            startY: chatPos.y
        };
        setDraggingChat(true);
    };

    const mySeat = myPlayer?.seatIndex ?? (myIndex >= 0 ? myIndex : -1);
    const spectators = gameState.spectators ?? [];
    const isSpectator = spectators.some(s => s.id === myId);
    const amSeatedHuman = myIndex !== -1 && myPlayer && !myPlayer.isBot;

    const sortedHand = useMemo(() => {
        if (!myPlayer) return [];
        return sortHandCards(myPlayer.hand, gameState.trump);
    }, [myPlayer?.hand, gameState.trump]);

    const dealingVisibleHand = useMemo(() => {
        if (!myPlayer || gameState.phase !== 'DEALING' || mySeat < 0) return [];
        const n = cardsDealtToSeat(gameState.dealerIndex, mySeat, dealStep, playerCount);
        const slice = myPlayer.hand.slice(0, n);
        return sortHandCards(slice, null);
    }, [myPlayer?.hand, gameState.phase, gameState.dealerIndex, mySeat, dealStep, playerCount]);

    const displayHand = gameState.phase === 'DEALING' ? dealingVisibleHand : sortedHand;
    const isMyTurnToPlay = gameState.phase === 'TRICK_PLAY' && gameState.turnIndex === myIndex;
    const currentLeadSuit = gameState.currentTrick.leadSuit;
    const inTrickPlay = gameState.phase === 'TRICK_PLAY';

    const isLegalTrickPlayCard = useCallback((cardId: string): boolean => {
        if (!inTrickPlay || !myPlayer) return false;
        const card = myPlayer.hand.find((c) => c.id === cardId);
        if (!card) return false;
        return isLegalPlay(card, myPlayer.hand, currentLeadSuit, gameState.trump);
    }, [inTrickPlay, gameState.trump, currentLeadSuit, myPlayer]);

    const canQueuePremove = useCallback((cardId: string): boolean => {
        return inTrickPlay && !isMyTurnToPlay && isLegalTrickPlayCard(cardId);
    }, [inTrickPlay, isMyTurnToPlay, isLegalTrickPlayCard]);

    const playCard = useCallback((cardId: string) => {
        if (!isLegalTrickPlayCard(cardId)) return;
        socket.emit('playCard', cardId);
        setSelectedCardIds([]);
        setQueuedPremoveCardId(null);
        setHoveredCardIndex(null);
    }, [isLegalTrickPlayCard]);

    const handleTrickPlaySelection = useCallback((cardId: string) => {
        if (isMyTurnToPlay) {
            playCard(cardId);
            return;
        }
        if (canQueuePremove(cardId)) {
            setQueuedPremoveCardId((prev) => prev === cardId ? null : cardId);
        }
    }, [isMyTurnToPlay, playCard, canQueuePremove]);

    useEffect(() => {
        if (!queuedPremoveCardId) return;
        if (gameState.phase !== 'TRICK_PLAY' || !myPlayer) {
            setQueuedPremoveCardId(null);
            return;
        }
        const stillInHand = myPlayer.hand.some((card) => card.id === queuedPremoveCardId);
        if (!stillInHand || !isLegalTrickPlayCard(queuedPremoveCardId)) {
            setQueuedPremoveCardId(null);
        }
    }, [queuedPremoveCardId, gameState.phase, gameState.currentTrick.leadSuit, gameState.trump, myPlayer, isLegalTrickPlayCard]);

    useEffect(() => {
        if (!queuedPremoveCardId || !isMyTurnToPlay) return;
        if (!isLegalTrickPlayCard(queuedPremoveCardId)) {
            setQueuedPremoveCardId(null);
            return;
        }
        playCard(queuedPremoveCardId);
    }, [queuedPremoveCardId, isMyTurnToPlay, gameState.currentTrick.leadSuit, gameState.trump, isLegalTrickPlayCard, playCard]);

    useEffect(() => {
        if (gameState.phase !== 'TRICK_PLAY' || displayHand.length === 0) {
            setHoveredCardIndex(null);
            return;
        }
        setHoveredCardIndex((prev) => {
            const firstLegal = displayHand.findIndex(c => isLegalTrickPlayCard(c.id));
            if (firstLegal === -1) return null;
            if (prev === null) return firstLegal;
            const clamped = Math.min(prev, displayHand.length - 1);
            if (isLegalTrickPlayCard(displayHand[clamped].id)) return clamped;
            return firstLegal;
        });
    }, [displayHand, inTrickPlay, isLegalTrickPlayCard]);

    useEffect(() => {
        if (gameState.phase !== 'TRICK_PLAY') {
            return;
        }

        const onKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (target) {
                const tag = target.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
            }

            if (e.key === 'Enter') {
                if (hoveredCardIndex !== null) {
                    e.preventDefault();
                    const hoveredCard = displayHand[hoveredCardIndex];
                    if (hoveredCard && isLegalTrickPlayCard(hoveredCard.id)) {
                        handleTrickPlaySelection(hoveredCard.id);
                    }
                }
                return;
            }

            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const step = (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 1;
                const len = displayHand.length;
                if (len <= 0) return;
                setHoveredCardIndex((prev) => {
                    let idx = prev === null ? (step > 0 ? -1 : 0) : prev;
                    for (let i = 0; i < len; i++) {
                        idx = (idx + step + len) % len;
                        if (isLegalTrickPlayCard(displayHand[idx].id)) return idx;
                    }
                    return prev;
                });
                return;
            }

            const keyNumber = Number(e.key);
            if (!Number.isInteger(keyNumber) || keyNumber < 1 || keyNumber > 8) return;

            const card = displayHand[keyNumber - 1];
            if (!card || !isLegalTrickPlayCard(card.id)) return;

            e.preventDefault();
            if (hoveredCardIndex === keyNumber - 1) {
                handleTrickPlaySelection(card.id);
            } else {
                setHoveredCardIndex(keyNumber - 1);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [displayHand, hoveredCardIndex, inTrickPlay, handleTrickPlaySelection, isLegalTrickPlayCard]);

    const toggleSelect = (id: string) => {
        if (gameState.phase === 'TRICK_PLAY') {
            handleTrickPlaySelection(id);
            return;
        }

        if (selectedCardIds.includes(id)) {
            setSelectedCardIds(selectedCardIds.filter(x => x !== id));
        } else {
            const limit = maxDiscardSelection;
            if (selectedCardIds.length < limit) {
                setSelectedCardIds([...selectedCardIds, id]);
            }
        }
    };

    const POSITIONS = playerCount === 4
        ? ['bottom', 'left', 'top', 'right']
        : ['bottom', 'bottom-left', 'top-left', 'top', 'top-right', 'bottom-right'];

    // Seated players rotate the table so their seat is at the bottom (hidden — hand
    // is shown in .my-hand). Spectators get a fixed overview so all seats are visible.
    const viewSeat = isSpectator ? null : (myPlayer?.seatIndex ?? (myIndex >= 0 ? myIndex : 0));

    const seatToPosition = (seatNum: number) => {
        if (viewSeat === null) return POSITIONS[seatNum];
        return POSITIONS[(seatNum - viewSeat + playerCount) % playerCount];
    };

    const playerIndexToTrickPosition = (playerIndex: number) => {
        if (isSpectator) {
            return playerCount === 4 ? [0, 2, 3, 5][playerIndex] : playerIndex;
        }
        const relIndex = (playerIndex - myIndex + playerCount) % playerCount;
        return playerCount === 4 ? [0, 2, 3, 5][relIndex] : relIndex;
    };

    // Calculate Tricks Taken
    const tricksA = gameState.tricksHistory.filter(t => gameState.players[t.winnerIndex!].team === 'A').length;
    const tricksB = gameState.tricksHistory.filter(t => gameState.players[t.winnerIndex!].team === 'B').length;
    const calledTeam = gameState.declarerIndex !== null
        ? gameState.players[gameState.declarerIndex]?.team ?? null
        : null;

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
        <div className={`table ${isSpectator ? 'spectator-view' : ''}`}>
            {/* Back to Home */}
            <button className="back-home-btn" onClick={onLeave}>
                &larr; Leave Game
            </button>

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
                    <>
                        <div className="hud-trump-row">
                            <span className="hud-trump-label">Trump</span>
                            {shouldHideTrumpHud(gameState, myIndex) ? (
                                <span className="hud-trump-text">Hidden</span>
                            ) : gameState.trump ? (
                                <span className="hud-trump-value" style={{ color: HUD_SUIT_COLOR[gameState.trump] || '#fff' }}>
                                    {SUIT_SYMBOL[gameState.trump]}
                                </span>
                            ) : (
                                <span className="hud-trump-text">
                                    {gameState.winningBid && !shouldConcealShootBidFromViewer(gameState.winningBid, gameState.gameMode, gameState.phase, myIndex)
                                        ? (gameState.winningBid.type === 'HIGH' ? 'High' : (gameState.winningBid.type === 'LOW' ? 'Low' : '—'))
                                        : '—'}
                                </span>
                            )}
                            {gameState.winningBid && gameState.declarerIndex !== null && gameState.phase !== 'BIDDING' && (
                                <span className="hud-contract-text">
                                    {shouldConcealShootBidFromViewer(gameState.winningBid, gameState.gameMode, gameState.phase, myIndex)
                                        ? getShootLabel(gameState)
                                        : isShootBid(gameState)
                                            ? getShootLabel(gameState)
                                            : (
                                                <>
                                                    {gameState.winningBid.amount}
                                                    {gameState.winningBid.type === 'SUIT' && gameState.winningBid.suit
                                                        ? <span style={{ color: HUD_SUIT_COLOR[gameState.winningBid.suit] }}> {SUIT_SYMBOL[gameState.winningBid.suit]}</span>
                                                        : ` ${gameState.winningBid.type}`}
                                                </>
                                            )}
                                </span>
                            )}
                        </div>
                        {gameState.winningBid && calledTeam && gameState.phase !== 'BIDDING' && (
                            <div className="hud-caller-text">
                                Called by <span className={`hud-caller-team hud-caller-team-${calledTeam}`}>Team {calledTeam}</span>
                            </div>
                        )}
                    </>
                )}
            </div>

            <div
                ref={chatPanelRef}
                className={`chat-panel ${draggingChat ? 'dragging' : ''} ${chatMinimized ? 'minimized' : ''} ${chatFlash ? 'flash' : ''}`}
                style={chatPos ? { left: `${chatPos.x}px`, top: `${chatPos.y}px` } : { visibility: 'hidden' }}
            >
                <div
                    className="chat-header"
                    onMouseDown={onChatHeaderMouseDown}
                    onTouchStart={onChatHeaderTouchStart}
                >
                    <span className="chat-title">
                        <span className="chat-icon" aria-hidden="true">💬</span>
                        <span>Chat</span>
                        {unreadCount > 0 && chatMinimized && (
                            <span className="chat-unread-badge" aria-label={`${unreadCount} unread messages`}>
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                        )}
                    </span>
                    <button
                        className="chat-min-btn"
                        onClick={() => setChatMinimized(v => !v)}
                        title={chatMinimized ? 'Expand chat' : 'Minimize chat'}
                        aria-label={chatMinimized ? 'Expand chat' : 'Minimize chat'}
                    >
                        {chatMinimized ? '▢' : '—'}
                    </button>
                </div>
                {!chatMinimized && (
                    <>
                        <div className="chat-messages" ref={chatMessagesRef}>
                            {chatMessages.length === 0 ? (
                                <div className="chat-empty">No messages yet</div>
                            ) : (
                                chatMessages.map((msg) => (
                                    <div key={msg.id} className={`chat-message ${msg.senderId === myId ? 'mine' : ''}`}>
                                        <span className="chat-sender">{msg.senderName}:</span>
                                        <span className="chat-text">{msg.text}</span>
                                    </div>
                                ))
                            )}
                        </div>
                        <form className="chat-input-row" onSubmit={submitChat}>
                            <input
                                className="chat-input"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                maxLength={240}
                                placeholder="Type a message..."
                            />
                            <button className="chat-send-btn" type="submit">Send</button>
                        </form>
                    </>
                )}
            </div>

            {/* Dealing Animation */}
            {gameState.phase === 'DEALING' && (
                <DealingAnimation
                    dealerIndex={gameState.dealerIndex}
                    myIndex={myIndex}
                    currentStep={dealStep}
                    playerCount={playerCount}
                    isSpectator={isSpectator}
                />
            )}

            {/* Players & Seats */}
            {Array.from({ length: playerCount }, (_, seatNum) => seatNum).map((seatNum) => {
                const pos = seatToPosition(seatNum);

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
                const pIdx = gameState.players.findIndex(pl => pl.id === p.id);
                const isLeadBidder = gameState.phase === 'PRE_BID_DISCARD' && pIdx === gameState.currentBidderIndex;
                const isTurn = (gameState.turnIndex !== -1 && gameState.players[gameState.turnIndex]?.id === p.id) || isLeadBidder;
                const teamClass = `team-${p.team}`;
                const playerBid = gameState.bids.find(b => gameState.players[b.playerIndex]?.id === p.id);

                let bidText: React.ReactNode = null;
                if (gameState.phase === 'BIDDING' && playerBid) {
                    const bidIsShoot = isShootBidAmount(playerBid.amount, gameState.gameMode);
                    const concealed = shouldConcealShootBidFromViewer(playerBid, gameState.gameMode, gameState.phase, myIndex);
                    if (concealed || (bidIsShoot && pIdx !== myIndex)) {
                        bidText = getShootLabelForAmount(playerBid.amount, gameState.gameMode);
                    } else if (playerBid.type === 'SUIT' && playerBid.suit) {
                        const sym = SUIT_SYMBOL[playerBid.suit] || playerBid.suit;
                        const col = SUIT_COLOR[playerBid.suit] || '#000';
                        bidText = <>{playerBid.amount} <span style={{ color: col }}>{sym}</span></>;
                    } else {
                        bidText = `${playerBid.amount} ${playerBid.type}`;
                    }
                }

                const avatarDef = p.isBot ? BOT_AVATAR : getAvatarById(p.avatarId);

                const hasBidIndicator = !!bidText;
                const isDealer = gameState.phase !== 'LOBBY' && pIdx === gameState.dealerIndex;
                const isBidder = gameState.declarerIndex !== null
                    && gameState.players[gameState.declarerIndex]?.id === p.id
                    && gameState.phase !== 'LOBBY';
                const hasBadge = (gameState.phase === 'PRE_BID_DISCARD' && isLeadBidder)
                    || isDealer
                    || isBidder;

                return (
                    <div key={p.id} className={`player-seat ${pos} ${isTurn ? 'turn' : ''} ${teamClass} ${hasBidIndicator ? 'has-bid' : ''} ${hasBadge ? 'has-badge' : ''}`}>
                        <div className="avatar" style={avatarDef ? { background: avatarDef.bg } : undefined}>
                            <span className="avatar-emoji">{avatarDef ? avatarDef.emoji : p.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="player-name">{p.name} {p.isBot ? '🤖' : ''}</div>
                        {bidText && <div className="bid-bubble">{bidText}</div>}
                        <div className={`team-label team-${p.team}`}>TEAM {p.team}</div>
                        <div className="player-role-badges">
                            {gameState.phase === 'PRE_BID_DISCARD' && isLeadBidder && (
                                <div className="badge badge-first-bid">First Bid</div>
                            )}
                            {isDealer && (
                                <div className="badge badge-dealer">Dealer</div>
                            )}
                            {isBidder && (
                                <div className="badge badge-bidder">
                                    {isShootBid(gameState) ? 'Shooting' : 'Bidder'}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}

            {/* Center Trick / Bidding */}
            <div className="trick-zone">
                {gameState.phase === 'BIDDING' && (
                    <div className="bidding-center-panel">
                        <div className="bidding-center-label">Current Bid</div>
                        {gameState.winningBid ? (
                            <div className="bidding-center-value">
                                {shouldConcealShootBidFromViewer(gameState.winningBid, gameState.gameMode, gameState.phase, myIndex)
                                    ? getShootLabelForAmount(gameState.winningBid.amount, gameState.gameMode)
                                    : gameState.winningBid.type === 'SUIT' && gameState.winningBid.suit
                                        ? (
                                            <>
                                                {gameState.winningBid.amount}{' '}
                                                <span style={{ color: HUD_SUIT_COLOR[gameState.winningBid.suit] }}>
                                                    {SUIT_SYMBOL[gameState.winningBid.suit]}
                                                </span>
                                            </>
                                        )
                                        : isShootBidAmount(gameState.winningBid.amount, gameState.gameMode)
                                            ? getShootLabelForAmount(gameState.winningBid.amount, gameState.gameMode)
                                            : `${gameState.winningBid.amount} ${gameState.winningBid.type}`}
                            </div>
                        ) : (
                            <div className="bidding-center-value bidding-center-none">No bids yet</div>
                        )}
                        {gameState.winningBid && gameState.declarerIndex !== null && (
                            <div className="bidding-center-by">
                                by {gameState.players[gameState.declarerIndex]?.name ?? '?'}
                            </div>
                        )}
                        <div className="bidding-center-turn">
                            {gameState.currentBidderIndex === myIndex
                                ? 'Your turn to bid'
                                : `${gameState.players[gameState.currentBidderIndex]?.name ?? '…'} is bidding…`}
                        </div>
                    </div>
                )}
                {gameState.currentTrick.plays.map((play) => {
                    const trickPosIndex = playerIndexToTrickPosition(play.playerIndex);
                    const isWinning = winningPlay && play.playerIndex === winningPlay.playerIndex;
                    const teamClass = gameState.players[play.playerIndex].team === 'A' ? 'team-A' : 'team-B';

                    const winnerIdx = gameState.currentTrick.winnerIndex;
                    const collectTarget = winnerIdx !== null ? playerIndexToTrickPosition(winnerIdx) : -1;

                    return (
                        <div
                            key={play.card.id}
                            className={`trick-card pos-${trickPosIndex} ${teamClass} ${isWinning ? 'winning' : ''} ${collectingTrick ? 'collecting' : ''}`}
                            style={collectingTrick && collectTarget >= 0 ? {
                                '--collect-target': collectTarget,
                            } as React.CSSProperties : undefined}
                            data-collect-target={collectTarget}
                        >
                            <Card card={play.card} />
                        </div>
                    );
                })}
            </div>

            {/* TRAM reveal — centered overlay so cards stay on screen */}
            {gameState.tramClaim && (() => {
                const claim = gameState.tramClaim;
                const claimer = gameState.players[claim.playerIndex];
                const claimAvatar = claimer?.isBot ? BOT_AVATAR : getAvatarById(claimer?.avatarId);
                const tramCards = sortHandCards(claim.cards, gameState.trump);
                return (
                    <div className="tram-overlay" role="status" aria-live="polite">
                        <div className="tram-overlay-panel">
                            <div className="tram-overlay-header">
                                {claimAvatar && (
                                    <div className="tram-claimer-avatar" style={{ background: claimAvatar.bg }}>
                                        <span>{claimAvatar.emoji}</span>
                                    </div>
                                )}
                                <div className="tram-speech-bubble">
                                    <span className="tram-claimer-name">{claim.playerName}</span>
                                    <span className="tram-speech-text">The rest are mine!</span>
                                </div>
                            </div>
                            <div className="tram-cards-fan">
                                {tramCards.map((card, i) => (
                                    <div
                                        key={card.id}
                                        className="tram-card-slot"
                                        style={{ zIndex: i }}
                                    >
                                        <Card card={card} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* My Hand — only for seated players */}
            {!isSpectator && (
                <>
                    <div className="my-hand">
                        {displayHand.map((card, index) => {
                            const legal = isLegalTrickPlayCard(card.id);
                            const keyboardHovered = inTrickPlay && legal && hoveredCardIndex === index;
                            const hasQueuedPremove = queuedPremoveCardId === card.id;
                            const illegal = inTrickPlay && !legal;
                            return (
                                <div
                                    key={card.id}
                                    className={['my-hand-card-slot', keyboardHovered ? 'keyboard-hover' : '', illegal ? 'illegal' : ''].filter(Boolean).join(' ')}
                                    title={illegal ? 'Must follow suit' : undefined}
                                    onMouseEnter={() => {
                                        if (inTrickPlay && legal) setHoveredCardIndex(index);
                                    }}
                                >
                                    <Card
                                        card={card}
                                        playable={legal && (isMyTurnToPlay || canQueuePremove(card.id))}
                                        illegal={illegal}
                                        selected={selectedCardIds.includes(card.id) || keyboardHovered || hasQueuedPremove}
                                        onClick={() => toggleSelect(card.id)}
                                        isTrump={gameState.trump ? getEffectiveSuit(card, gameState.trump) === gameState.trump : false}
                                    />
                                    {index < 8 && <div className="card-shortcut-label">{index + 1}</div>}
                                </div>
                            );
                        })}
                    </div>
                    {inTrickPlay && !isMyTurnToPlay && queuedPremoveCardId && (
                        <div className="premove-status">Premove queued - same card, Enter, or same number cancels</div>
                    )}
                </>
            )}

            {/* Controls Overlay — seated players only */}
            {!isSpectator && (
            <div className="controls-overlay">
                <Controls gameState={gameState} myIndex={myIndex} selectedCardIds={selectedCardIds} onAction={clearSelection} />
            </div>
            )}

            {/* Game Over Overlay */}
            {gameState.phase === 'GAME_OVER' && (
                <div className="game-over-overlay">
                    <div className="game-over-modal">
                        <h1 className="game-over-title">Game Over</h1>
                        <div className="game-over-scores">
                            <div className={`team-score ${(
                                gameState.gameMode === 'MEGA_DRAFT'
                                    ? gameState.scores.A >= 50 || gameState.scores.B <= -100
                                    : gameState.scores.A >= 32
                            ) ? 'winner' : ''}`}>
                                <span className="team-label">Team A</span>
                                <span className="team-points">{gameState.scores.A}</span>
                                {(gameState.gameMode === 'MEGA_DRAFT'
                                    ? gameState.scores.A >= 50 || gameState.scores.B <= -100
                                    : gameState.scores.A >= 32) && <span className="winner-badge">Winner!</span>}
                            </div>
                            <div className="vs-divider">vs</div>
                            <div className={`team-score ${(
                                gameState.gameMode === 'MEGA_DRAFT'
                                    ? gameState.scores.B >= 50 || gameState.scores.A <= -100
                                    : gameState.scores.B >= 32
                            ) ? 'winner' : ''}`}>
                                <span className="team-label">Team B</span>
                                <span className="team-points">{gameState.scores.B}</span>
                                {(gameState.gameMode === 'MEGA_DRAFT'
                                    ? gameState.scores.B >= 50 || gameState.scores.A <= -100
                                    : gameState.scores.B >= 32) && <span className="winner-badge">Winner!</span>}
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

            {/* Spectators panel (visible to everyone, including spectators themselves). */}
            {(spectators.length > 0 || isSpectator) && (
                <div className="spectators-panel">
                    <div className="spectators-header">
                        <span>👀 Spectators</span>
                        <span className="spectators-count">{spectators.length}</span>
                    </div>
                    {isSpectator && (
                        <div className="spectator-self-badge">You are watching</div>
                    )}
                    <div className="spectators-list">
                        {spectators.length === 0 ? (
                            <div className="spectators-empty">No spectators yet</div>
                        ) : (
                            spectators.map(s => {
                                const isMe = s.id === myId;
                                return (
                                    <div key={s.id} className={`spectator-item ${isMe ? 'self' : ''}`}>
                                        <span className="spectator-emoji" aria-hidden="true">
                                            {(s.avatarId && getAvatarById(s.avatarId)?.emoji) || '👤'}
                                        </span>
                                        <span className="spectator-name">{s.name}{isMe ? ' (you)' : ''}</span>
                                        {/* Only seated humans can offer their seat. */}
                                        {amSeatedHuman && !isMe && (
                                            <button
                                                className="spectator-swap-btn"
                                                title={`Offer your seat to ${s.name}`}
                                                onClick={() => askToSwapWithSpectator(s.id, s.name)}
                                            >
                                                ↔
                                            </button>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}

            {/* Swap-offer modal: shown to the spectator the moment a player invites them. */}
            {pendingSwapOffer && (
                <div className="swap-offer-overlay">
                    <div className="swap-offer-modal">
                        <h2>Seat Swap Request</h2>
                        <p>
                            <strong>{pendingSwapOffer.fromPlayerName}</strong>
                            {pendingSwapOffer.fromPlayerSeatIndex !== undefined
                                ? ` (seat ${pendingSwapOffer.fromPlayerSeatIndex + 1})`
                                : ''}
                            {' '}wants to give you their seat. Accept to take their hand and join the game.
                        </p>
                        <div className="swap-offer-actions">
                            <button className="btn-secondary" onClick={() => respondToSwap(false)}>
                                Decline
                            </button>
                            <button className="btn-primary" onClick={() => respondToSwap(true)}>
                                Accept &amp; Take Seat
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast for spectator swap results (sent / declined / accepted). */}
            {swapToast && (
                <div className="swap-toast">{swapToast}</div>
            )}

            {/* Bot Takeover Overlay (only shown for joiners who came in via the
                normal join path mid-game, NOT for explicit spectators who should
                be able to just watch). */}
            {gameState.phase !== 'LOBBY' && gameState.phase !== 'GAME_OVER' && myIndex === -1 && !isSpectator && (
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
                    <p>{gameState.players.length} / {playerCount} joined</p>

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
                        {Array.from({ length: playerCount - gameState.players.length }).map((_, i) => (
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
