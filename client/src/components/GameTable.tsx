import React, { useState } from 'react';
import type { GameState } from '../types';
import { determineTrickWinner } from '@shared/CardUtils';
import { Card } from './Card';
import { Controls } from './Controls';
import { socket } from '../socket';
import './GameTable.css';

interface Props {
    gameState: GameState;
    myId: string;
}

export const GameTable: React.FC<Props> = ({ gameState, myId }) => {
    const myIndex = gameState.players.findIndex(p => p.id === myId);
    const myPlayer = gameState.players[myIndex];

    const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);

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

            {/* Players */}
            {gameState.players.map((p, i) => {
                const relIndex = (i - myIndex + 6) % 6;
                const pos = POSITIONS[relIndex];
                const isTurn = gameState.turnIndex === i;

                // Find bid
                const playerBid = gameState.bids.find(b => b.playerIndex === i);
                const hasPassed = gameState.phase === 'BIDDING' && !playerBid && gameState.bids.length > 0; // logic for pass is tricky since passed bids aren't stored in `bids` array in Game.ts?
                // Wait, Game.ts: "if (bid !== 'PASS') this.state.bids.push(bid);"
                // So passes are NOT in state.bids.
                // We only know if it IS their turn?
                // The user asked: "indicate the bids that each player made".
                // Since `bids` only stores active bids, we can show the active bid if it exists.
                // If they are not in `bids` and it's past their turn? We don't track who passed explicitly in public state except by deduction?
                // Actually `Game.ts` does NOT store passes explicitly.
                // But we can show the bid if they made one.

                let bidText = null;
                if (gameState.phase === 'BIDDING') {
                    if (playerBid) {
                        bidText = `${playerBid.amount} ${playerBid.type === 'SUIT' ? playerBid.suit : playerBid.type}`;
                    }
                    // If it's NOT their turn and they don't have a bid in `bids` list... they passed?
                    // Or they haven't acted yet.
                    // It's hard to distinguish "Passed" vs "Waiting" without `biddingTurnCount` history.
                    // But we can just show "Bid: X" for now.
                }

                return (
                    <div key={i} className={`player-seat ${pos} ${isTurn ? 'turn' : ''} team-${p.team}`}>
                        <div className="avatar">{p.name} ({p.team})</div>
                        {bidText && <div className="bid-bubble">{bidText}</div>}
                        <div className="hand-count">{p.hand.length} Cards</div>
                        {gameState.declarerIndex === i && <div className="badge">Bidder</div>}
                    </div>
                );
            })}

            {/* Center Trick */}
            <div className="trick-zone">
                {gameState.currentTrick.plays.map((play, _, allPlays) => {
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
                {myPlayer.hand.map((card) => (
                    <Card
                        key={card.id}
                        card={card}
                        playable={gameState.phase === 'TRICK_PLAY' && gameState.turnIndex === myIndex}
                        selected={selectedCardIds.includes(card.id)}
                        onClick={() => toggleSelect(card.id)}
                    />
                ))}
            </div>

            {/* Controls Overlay */}
            <div className="controls-overlay">
                <Controls gameState={gameState} myIndex={myIndex} selectedCardIds={selectedCardIds} />
            </div>
        </div>
    );
};
