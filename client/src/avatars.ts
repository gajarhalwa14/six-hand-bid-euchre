export interface AvatarDef {
    id: string;
    bg: string; // gradient background
    emoji: string;
    label: string;
}

const AVATARS: AvatarDef[] = [
    { id: 'fox',       bg: 'linear-gradient(135deg, #ff6b35, #f7931e)', emoji: '🦊', label: 'Fox' },
    { id: 'cat',       bg: 'linear-gradient(135deg, #a855f7, #7c3aed)', emoji: '🐱', label: 'Cat' },
    { id: 'bear',      bg: 'linear-gradient(135deg, #8b5e34, #d2691e)', emoji: '🐻', label: 'Bear' },
    { id: 'panda',     bg: 'linear-gradient(135deg, #4ade80, #22c55e)', emoji: '🐼', label: 'Panda' },
    { id: 'owl',       bg: 'linear-gradient(135deg, #1e40af, #3b82f6)', emoji: '🦉', label: 'Owl' },
    { id: 'unicorn',   bg: 'linear-gradient(135deg, #ec4899, #f472b6)', emoji: '🦄', label: 'Unicorn' },
    { id: 'dragon',    bg: 'linear-gradient(135deg, #dc2626, #f87171)', emoji: '🐉', label: 'Dragon' },
    { id: 'wolf',      bg: 'linear-gradient(135deg, #475569, #94a3b8)', emoji: '🐺', label: 'Wolf' },
    { id: 'lion',      bg: 'linear-gradient(135deg, #f59e0b, #fbbf24)', emoji: '🦁', label: 'Lion' },
    { id: 'penguin',   bg: 'linear-gradient(135deg, #06b6d4, #22d3ee)', emoji: '🐧', label: 'Penguin' },
    { id: 'monkey',    bg: 'linear-gradient(135deg, #d97706, #fbbf24)', emoji: '🐵', label: 'Monkey' },
    { id: 'alien',     bg: 'linear-gradient(135deg, #10b981, #6ee7b7)', emoji: '👽', label: 'Alien' },
    { id: 'robot',     bg: 'linear-gradient(135deg, #6366f1, #818cf8)', emoji: '🤖', label: 'Robot' },
    { id: 'ghost',     bg: 'linear-gradient(135deg, #8b5cf6, #c084fc)', emoji: '👻', label: 'Ghost' },
    { id: 'octopus',   bg: 'linear-gradient(135deg, #e11d48, #fb7185)', emoji: '🐙', label: 'Octopus' },
    { id: 'eagle',     bg: 'linear-gradient(135deg, #0369a1, #38bdf8)', emoji: '🦅', label: 'Eagle' },
];

export default AVATARS;

export function getAvatarById(id?: string): AvatarDef | undefined {
    if (!id) return undefined;
    return AVATARS.find(a => a.id === id);
}

export const BOT_AVATAR: AvatarDef = {
    id: 'bot', bg: 'linear-gradient(135deg, #374151, #6b7280)', emoji: '🤖', label: 'Bot'
};
