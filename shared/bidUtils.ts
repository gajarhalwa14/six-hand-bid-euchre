import type { Bid, GameMode, Phase } from './types';

export function isShootBidAmount(amount: number, gameMode: GameMode): boolean {
    return amount === 9 || (gameMode === 'MEGA_DRAFT' && amount === 10);
}

/** Shoot suit/type stay hidden from non-shooters through discard; revealed at SHOOT_PASS. */
export function shouldConcealShootBid(phase: Phase): boolean {
    return phase === 'BIDDING' || phase === 'SHOOT_DISCARD';
}

export function shouldConcealShootBidFromViewer(
    bid: Bid | null | undefined,
    gameMode: GameMode,
    phase: Phase,
    viewerPlayerIndex: number
): boolean {
    if (!bid || viewerPlayerIndex === -1) return false;
    if (!isShootBidAmount(bid.amount, gameMode)) return false;
    if (bid.playerIndex === viewerPlayerIndex) return false;
    return shouldConcealShootBid(phase);
}

export function getShootLabelForAmount(amount: number, gameMode: GameMode): string {
    if (gameMode === 'MEGA_DRAFT' && amount === 10) return '1-Card Shoot';
    return 'Shoot';
}
