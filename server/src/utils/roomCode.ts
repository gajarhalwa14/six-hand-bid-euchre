import { GameMode } from '../types';

export function getRoomCodeLength(gameMode: GameMode): number {
    return gameMode === 'MEGA_DRAFT' ? 4 : 6;
}

export function generateRoomCode(gameMode: GameMode): string {
    const length = getRoomCodeLength(gameMode);
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return String(Math.floor(Math.random() * (max - min + 1)) + min);
}
