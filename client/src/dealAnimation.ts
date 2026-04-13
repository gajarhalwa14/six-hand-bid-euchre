/** Must match DealingAnimation: one event every DEAL_STEP_MS, 4×6 pairs. */
export const DEAL_STEP_MS = 120;
export const DEAL_EVENT_COUNT = 24;

export function targetSeatForDealEvent(dealerIndex: number, eventIndex: number): number {
    const i = (eventIndex % 6) + 1;
    return (dealerIndex + i) % 6;
}

/** How many cards seat has received after deal events 0..lastEventIndex (inclusive). */
export function cardsDealtToSeat(dealerIndex: number, seat: number, lastEventIndex: number): number {
    if (lastEventIndex < 0) return 0;
    let n = 0;
    for (let e = 0; e <= lastEventIndex; e++) {
        if (targetSeatForDealEvent(dealerIndex, e) === seat) n += 2;
    }
    return n;
}
