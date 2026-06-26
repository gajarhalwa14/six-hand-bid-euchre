export type Suit = 'Spades' | 'Hearts' | 'Clubs' | 'Diamonds';
export type Rank = '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
    id: string; // Unique ID to distinguish duplicates
    suit: Suit;
    rank: Rank;
}

export type TeamId = 'A' | 'B';
export type GameMode = 'CLASSIC' | 'MEGA_DRAFT';

export interface Player {
    id: string;
    name: string;
    team: TeamId;
    hand: Card[]; // Only visible to the player
    isConnected: boolean;
    seatIndex?: number; // 0-5. For private lobbies.
    isBot: boolean;
    avatarId?: string;
}

export interface Spectator {
    id: string;
    name: string;
    avatarId?: string;
    isConnected: boolean;
}

export type Phase = 'LOBBY' | 'DEALING' | 'PRE_BID_DISCARD' | 'BIDDING' | 'SHOOT_DISCARD' | 'SHOOT_PASS' | 'TRICK_PLAY' | 'TRICK_END' | 'SCORING' | 'GAME_OVER';

export type BidType = 'SUIT' | 'HIGH' | 'LOW';

export interface Bid {
    amount: number; // 3 to 8
    type: BidType;
    suit?: Suit; // Required if type is SUIT
    playerIndex: number; // 0-5
}

export interface Play {
    playerIndex: number;
    card: Card;
}

export interface Trick {
    leadSuit: Suit | null; // For validation
    plays: Play[];
    winnerIndex: number | null;
}

export interface GameState {
    roomId: string;
    gameMode: GameMode;
    isPrivate: boolean; // Whether the room requires a code to join
    hostId: string | null; // Player ID of the room host
    players: Player[]; // Array of 6 players (or nulls/placeholders)
    phase: Phase;

    // Bidding
    currentBidderIndex: number;
    bids: Bid[];
    winningBid: Bid | null;
    declarerIndex: number | null;

    // Shooting
    preBidDiscardWaitList: number[]; // Mega Draft: players who still must discard 4 before bidding
    shootDiscardWaitList: number[]; // Indices of players who need to discard (shooter)
    shootPassWaitList: number[]; // Indices of partners who need to pass

    // Trick
    currentTrick: Trick;
    tricksHistory: Trick[];
    turnIndex: number; // Who plays next

    // Scoring
    scores: { A: number; B: number };

    // Meta
    dealerIndex: number;
    biddingTurnCount: number; // To track exactly 6 turns
    trump: Suit | null; // Can be null if High/Low

    /**
     * True iff the recipient of this state is currently allowed to call
     * "the rest are mine" (TRAM): they are on lead, the trick is empty,
     * and a worst-case simulation shows they win every remaining trick.
     * Computed per-recipient on the server.
     */
    canClaimRest?: boolean;

    /**
     * Users watching this room without occupying a seat. Anyone can watch;
     * active players can offer their seat to a spectator via a swap request.
     */
    spectators?: Spectator[];
}

export interface ChatMessage {
    id: string;
    roomId: string;
    senderId: string;
    senderName: string;
    text: string;
    timestamp: number;
}

export const SUITS: Suit[] = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];
export const RANKS: Rank[] = ['9', '10', 'J', 'Q', 'K', 'A'];

export interface SpectatorSwapOffer {
    fromPlayerId: string;
    fromPlayerName: string;
    fromPlayerSeatIndex?: number;
}

// Message Types
export interface ServerToClientEvents {
    gameState: (state: GameState) => void;
    playerJoined: (player: Player) => void;
    roomJoined: (roomId: string) => void;
    error: (msg: string) => void;
    chatHistory: (messages: ChatMessage[]) => void;
    chatMessage: (message: ChatMessage) => void;
    /** Player invited this spectator to take their seat. */
    spectatorSwapOffer: (offer: SpectatorSwapOffer) => void;
    /** Toast back to the player who sent / received a swap response. */
    spectatorSwapResult: (msg: string) => void;
}

export interface ClientToServerEvents {
    joinRoom: (roomId: string, name: string, isPrivate?: boolean, avatarId?: string, gameMode?: GameMode) => void;
    joinRandomRoom: (name: string, avatarId?: string, gameMode?: GameMode) => void;
    joinAsSpectator: (roomId: string, name: string, avatarId?: string) => void;
    chooseSeat: (seatIndex: number) => void;
    randomizeSeats: () => void;
    startGame: () => void;
    bid: (bid: Bid) => void;
    inputPassBid: () => void; // Pass on bidding
    playCard: (cardId: string) => void;
    discardCards: (cardIds: string[]) => void; // For Shooter
    passCard: (cardId: string) => void; // For Partner
    sendChatMessage: (text: string) => void;
    /** Active player invites a specific spectator to take their seat. */
    requestSwapWithSpectator: (spectatorId: string) => void;
    /** Spectator accepts/declines a pending swap offer. */
    respondSpectatorSwap: (fromPlayerId: string, accepted: boolean) => void;
    /** Claim the rest of the hand ("The Rest Are Mine"). Server validates. */
    claimRest: () => void;
}
