const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000`;

const USER_STORAGE_KEY = 'euchre_user';
const TOKEN_STORAGE_KEY = 'euchre_token';

type ApiErrorPayload = {
    detail?: string;
    error?: string;
};

export type AuthUser = {
    user_id: string;
    username: string;
    display_name: string;
};

type TokenResponse = {
    access_token: string;
    token_type: string;
};

export type UserUpdatePayload = {
    username?: string;
    display_name?: string;
    password?: string;
};

export type Game = {
    game_id: number;
    start_time?: string | null;
    end_time?: string | null;
    winning_team?: number | null;
    winning_score?: number | null;
    losing_score?: number | null;
    total_hands?: number | null;
};

export type GameCreatePayload = Omit<Game, 'game_id'>;
export type GameUpdatePayload = Partial<GameCreatePayload>;

export type GamePlayer = {
    id: number;
    game_id: number;
    user_id: string;
    seat_index: number;
    team: number;
    is_winner: boolean;
};

export type GamePlayerCreatePayload = Omit<GamePlayer, 'id'>;
export type GamePlayerUpdatePayload = Partial<GamePlayerCreatePayload>;

export type Hand = {
    id: number;
    game_id: number;
    hand_number: number;
    dealer_seat_index: number;
    trump_suit: string;
    contract_team_index: number;
    contract_value: number;
    contract_type: string;
    winning_team_index: number;
    tricks_team0: number;
    tricks_team1: number;
    points_team0: number;
    points_team1: number;
};

export type HandCreatePayload = Omit<Hand, 'id'>;
export type HandUpdatePayload = Partial<HandCreatePayload>;

type CollectionResponse<T> = {
    data: T[];
    count: number;
};

function parseResponsePayload<T>(text: string): ApiErrorPayload | T | null {
    if (!text) return null;
    try {
        return JSON.parse(text) as ApiErrorPayload | T;
    } catch {
        return null;
    }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${path}`, init);
    const text = await res.text();
    const payload = parseResponsePayload<T>(text);

    if (!res.ok) {
        const message = (payload as ApiErrorPayload | null)?.detail
            || (payload as ApiErrorPayload | null)?.error
            || 'Request failed';
        throw new Error(message);
    }

    return payload as T;
}

function getAuthHeader(): HeadersInit {
    const token = getStoredToken();
    if (!token) {
        throw new Error('You must be logged in');
    }
    return { Authorization: `Bearer ${token}` };
}

async function authenticatedRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: HeadersInit = {
        ...(init?.headers || {}),
        ...getAuthHeader(),
    };
    return apiRequest<T>(path, { ...init, headers });
}

async function requestToken(username: string, password: string): Promise<TokenResponse> {
    const body = new URLSearchParams();
    body.set('username', username);
    body.set('password', password);

    return apiRequest<TokenResponse>('/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
}

export async function fetchUserByUsername(username: string): Promise<AuthUser> {
    return apiRequest<AuthUser>(`/users/by-username/${encodeURIComponent(username)}`, {
        method: 'GET',
    });
}

export async function signup(username: string, displayName: string, password: string): Promise<AuthUser> {
    return apiRequest<AuthUser>('/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username,
            display_name: displayName,
            password,
        }),
    });
}

export async function login(username: string, password: string): Promise<{ user: AuthUser; token: string }> {
    const tokenData = await requestToken(username, password);
    const user = await fetchUserByUsername(username);
    return { user, token: tokenData.access_token };
}

export async function updateUser(userId: string, payload: UserUpdatePayload): Promise<AuthUser> {
    return authenticatedRequest<AuthUser>(`/users/${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function deleteUser(userId: string): Promise<{ deleted: boolean; user_id: string }> {
    return authenticatedRequest<{ deleted: boolean; user_id: string }>(
        `/users/${encodeURIComponent(userId)}`,
        { method: 'DELETE' },
    );
}

export async function listGames(limit = 100): Promise<CollectionResponse<Game>> {
    return apiRequest<CollectionResponse<Game>>(`/games?limit=${limit}`);
}

export async function createGame(payload: GameCreatePayload): Promise<Game> {
    return authenticatedRequest<Game>('/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function updateGame(gameId: number, payload: GameUpdatePayload): Promise<Game> {
    return authenticatedRequest<Game>(`/games/${gameId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function deleteGame(gameId: number): Promise<{ deleted: boolean; game_id: number }> {
    return authenticatedRequest<{ deleted: boolean; game_id: number }>(`/games/${gameId}`, {
        method: 'DELETE',
    });
}

export async function listHands(gameId?: number, limit = 100): Promise<CollectionResponse<Hand>> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (typeof gameId === 'number') {
        query.set('game_id', String(gameId));
    }
    return apiRequest<CollectionResponse<Hand>>(`/hands?${query.toString()}`);
}

export async function createHand(payload: HandCreatePayload): Promise<Hand> {
    return authenticatedRequest<Hand>('/hands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function updateHand(handId: number, payload: HandUpdatePayload): Promise<Hand> {
    return authenticatedRequest<Hand>(`/hands/${handId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function deleteHand(handId: number): Promise<{ deleted: boolean; id: number }> {
    return authenticatedRequest<{ deleted: boolean; id: number }>(`/hands/${handId}`, {
        method: 'DELETE',
    });
}

export async function listGamePlayers(
    gameId?: number,
    userId?: string,
    limit = 100,
): Promise<CollectionResponse<GamePlayer>> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (typeof gameId === 'number') query.set('game_id', String(gameId));
    if (userId) query.set('user_id', userId);
    return apiRequest<CollectionResponse<GamePlayer>>(`/game-players?${query.toString()}`);
}

export async function createGamePlayer(payload: GamePlayerCreatePayload): Promise<GamePlayer> {
    return authenticatedRequest<GamePlayer>('/game-players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function updateGamePlayer(playerId: number, payload: GamePlayerUpdatePayload): Promise<GamePlayer> {
    return authenticatedRequest<GamePlayer>(`/game-players/${playerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

export async function deleteGamePlayer(playerId: number): Promise<{ deleted: boolean; id: number }> {
    return authenticatedRequest<{ deleted: boolean; id: number }>(`/game-players/${playerId}`, {
        method: 'DELETE',
    });
}

export function persistAuthSession(user: AuthUser, token: string): void {
    localStorage.setItem(
        USER_STORAGE_KEY,
        JSON.stringify({ username: user.username, displayName: user.display_name, userId: user.user_id }),
    );
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearAuthSession(): void {
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function getStoredUser(): { username: string; displayName: string; userId?: string } | null {
    try {
        const raw = localStorage.getItem(USER_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function getStoredToken(): string | null {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
}

