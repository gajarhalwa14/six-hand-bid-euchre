import React, { useMemo } from 'react';
import './DealingAnimation.css';

interface Props {
    dealerIndex: number;
    myIndex: number;
    currentStep: number;
}

const POSITIONS = ['bottom', 'bottom-left', 'top-left', 'top', 'top-right', 'bottom-right'];

const POS_COORDS: Record<string, { x: number; y: number }> = {
    'bottom':       { x: 50,  y: 85 },
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

export const DealingAnimation: React.FC<Props> = ({ dealerIndex, myIndex, currentStep }) => {
    const events = useMemo(() => {
        const allEvents: DealEvent[] = [];
        for (let round = 0; round < 4; round++) {
            for (let i = 1; i <= 6; i++) {
                const targetSeat = (dealerIndex + i) % 6;
                allEvents.push({ targetSeat, round, pairIndex: allEvents.length });
            }
        }
        return allEvents;
    }, [dealerIndex]);

    const mySeat = myIndex >= 0 ? myIndex : 0;

    const dealerRel = (dealerIndex - mySeat + 6) % 6;
    const dealerPos = POSITIONS[dealerRel];
    const dealerCoord = POS_COORDS[dealerPos];

    return (
        <div className="dealing-overlay">
            <div className="dealing-label">Dealing...</div>
            {events.map((evt, idx) => {
                if (idx > currentStep) return null;

                const targetRel = (evt.targetSeat - mySeat + 6) % 6;
                const targetPos = POSITIONS[targetRel];
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
