import type { GameMode } from './types';

/** Number of digits in a room code for the given game mode. */
export function getRoomCodeLength(gameMode: GameMode): number {
    return gameMode === 'MEGA_DRAFT' ? 4 : 6;
}

/** Generate a numeric room code: 6 digits for Classic (6P), 4 for Mega Draft (4P). */
export function generateRoomCode(gameMode: GameMode): string {
    const length = getRoomCodeLength(gameMode);
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return String(Math.floor(Math.random() * (max - min + 1)) + min);
}
