export type Suit = 'Spades' | 'Hearts' | 'Clubs' | 'Diamonds';
export type Rank = '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
    id: string; // Unique ID to distinguish duplicates
    suit: Suit;
    rank: Rank;
}

export type TeamId = 'A' | 'B';

export interface Player {
    id: string;
    name: string;
    team: TeamId;
    hand: Card[]; // Only visible to the player
    isConnected: boolean;
    seatIndex?: number; // 0-5. For private lobbies.
    isBot: boolean;
}

export type Phase = 'LOBBY' | 'BIDDING' | 'SHOOT_DISCARD' | 'SHOOT_PASS' | 'TRICK_PLAY' | 'TRICK_END' | 'SCORING' | 'GAME_OVER';

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
    trump: Suit | null; // Can be null if High/Low
}

export interface RoomInfo {
    roomId: string;
    playerCount: number;
}

export const SUITS: Suit[] = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];
export const RANKS: Rank[] = ['9', '10', 'J', 'Q', 'K', 'A'];

// Message Types
export interface ServerToClientEvents {
    gameState: (state: GameState) => void;
    playerJoined: (player: Player) => void;
    roomJoined: (roomId: string) => void;
    error: (msg: string) => void;
    roomList: (rooms: RoomInfo[]) => void;
}

export interface ClientToServerEvents {
    joinRoom: (roomId: string, name: string, isPrivate?: boolean) => void;
    joinRandomRoom: (name: string) => void;
    requestRoomList: () => void;
    chooseSeat: (seatIndex: number) => void;
    randomizeSeats: () => void;
    startGame: () => void;
    bid: (bid: Bid) => void;
    inputPassBid: () => void; // Pass on bidding
    playCard: (cardId: string) => void;
    discardCards: (cardIds: string[]) => void; // For Shooter
    passCard: (cardId: string) => void; // For Partner
}
