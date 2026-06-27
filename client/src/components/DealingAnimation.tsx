import React, { useMemo } from 'react';
import './DealingAnimation.css';

interface Props {
    dealerIndex: number;
    myIndex: number;
    currentStep: number;
    playerCount: number;
    isSpectator?: boolean;
}

const POSITIONS = ['bottom', 'bottom-left', 'top-left', 'top', 'top-right', 'bottom-right'];

const POS_COORDS: Record<string, { x: number; y: number }> = {
    'bottom':       { x: 50,  y: 85 },
    'left':         { x: 8,   y: 50 },
    'right':        { x: 92,  y: 50 },
    'bottom-left':  { x: 12,  y: 72 },
    'top-left':     { x: 12,  y: 22 },
    'top':          { x: 50,  y: 8  },
    'top-right':    { x: 88,  y: 22 },
    'bottom-right': { x: 88,  y: 72 },
};

interface DealEvent {
    targetSeat: number;
    round: number;
    pairIndex: number;
}

export const DealingAnimation: React.FC<Props> = ({ dealerIndex, myIndex, currentStep, playerCount, isSpectator = false }) => {
    const events = useMemo(() => {
        const allEvents: DealEvent[] = [];
        const pairRounds = playerCount === 4 ? 6 : 4;
        for (let round = 0; round < pairRounds; round++) {
            for (let i = 1; i <= playerCount; i++) {
                const targetSeat = (dealerIndex + i) % playerCount;
                allEvents.push({ targetSeat, round, pairIndex: allEvents.length });
            }
        }
        return allEvents;
    }, [dealerIndex, playerCount]);

    const layoutPositions = playerCount === 4
        ? ['bottom', 'left', 'top', 'right']
        : POSITIONS;

    const mySeat = isSpectator ? 0 : (myIndex >= 0 ? myIndex : 0);

    const seatToLayoutPos = (seat: number) => {
        if (isSpectator) return layoutPositions[seat];
        return layoutPositions[(seat - mySeat + playerCount) % playerCount];
    };

    const dealerPos = seatToLayoutPos(dealerIndex);
    const dealerCoord = POS_COORDS[dealerPos];

    return (
        <div className="dealing-overlay">
            <div className="dealing-label">Dealing...</div>
            {events.map((evt, idx) => {
                if (idx > currentStep) return null;

                const targetPos = seatToLayoutPos(evt.targetSeat);
                const targetCoord = POS_COORDS[targetPos];

                return (
                    <div
                        key={idx}
                        className="deal-card-anim"
                        style={{
                            '--start-x': `${dealerCoord.x}vw`,
                            '--start-y': `${dealerCoord.y}vh`,
                            '--end-x': `${targetCoord.x}vw`,
                            '--end-y': `${targetCoord.y}vh`,
                        } as React.CSSProperties}
                    >
                        <div className="deal-card-face" />
                        <div className="deal-card-face second" />
                    </div>
                );
            })}
        </div>
    );
};
