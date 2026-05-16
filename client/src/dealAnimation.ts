/** Must match DealingAnimation timing. */
export const DEAL_STEP_MS = 120;
export const DEAL_EVENT_COUNT_CLASSIC = 24;
export const DEAL_EVENT_COUNT_MEGA = 24;

export function getDealEventCount(playerCount: number): number {
    return playerCount === 4 ? DEAL_EVENT_COUNT_MEGA : DEAL_EVENT_COUNT_CLASSIC;
}

export function targetSeatForDealEvent(dealerIndex: number, eventIndex: number, playerCount: number): number {
    const i = (eventIndex % playerCount) + 1;
    return (dealerIndex + i) % playerCount;
}

/** How many cards seat has received after deal events 0..lastEventIndex (inclusive). */
export function cardsDealtToSeat(dealerIndex: number, seat: number, lastEventIndex: number, playerCount: number): number {
    if (lastEventIndex < 0) return 0;
    let n = 0;
    for (let e = 0; e <= lastEventIndex; e++) {
        if (targetSeatForDealEvent(dealerIndex, e, playerCount) === seat) n += 2;
    }
    return n;
}
