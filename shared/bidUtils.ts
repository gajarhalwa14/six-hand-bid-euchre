import type { Bid, GameMode, Phase } from './types';

export function isShootBidAmount(amount: number, gameMode: GameMode): boolean {
    return amount === 9 || (gameMode === 'MEGA_DRAFT' && amount === 10);
}

/** Shoot suit/type stay hidden from everyone except shooter during bidding. */
export function shouldConcealShootBid(phase: Phase): boolean {
    return phase === 'BIDDING';
}

export function shouldConcealShootBidFromViewer(
    bid: Bid | null | undefined,
    gameMode: GameMode,
    phase: Phase,
    viewerPlayerIndex: number
): boolean {
    if (!bid) return false;
    if (!isShootBidAmount(bid.amount, gameMode)) return false;
    // During bidding, shoot details are hidden from everyone (including caller).
    return shouldConcealShootBid(phase);
}

export function getShootLabelForAmount(amount: number, gameMode: GameMode): string {
    if (gameMode === 'MEGA_DRAFT' && amount === 10) return '1-Card Shoot';
    return 'Shoot';
}
