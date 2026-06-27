import React, { useEffect, useState } from 'react';
import { socket } from '../socket';
import type { RoomInfo, GameMode } from '../types';
import { generateRoomCode, getRoomCodeLength } from '@shared/roomCode';
import AVATARS from '../avatars';
import './Lobby.css';

interface LobbyProps {
    onJoin: (
        roomId: string,
        name: string,
        isPrivate: boolean,
        avatarId?: string,
        gameMode?: GameMode,
        asSpectator?: boolean,
    ) => void;
    defaultName?: string;
    defaultAvatarId?: string;
    onLogout?: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({ onJoin, defaultName, defaultAvatarId, onLogout }) => {
    const [name, setName] = useState(defaultName || '');
    const [selectedAvatar, setSelectedAvatar] = useState<string>(defaultAvatarId || AVATARS[0].id);
    const [view, setView] = useState<'main' | 'join_code' | 'public_rooms' | 'spectate_code'>('main');
    const [gameMode, setGameMode] = useState<GameMode>('CLASSIC');
    const [roomCode, setRoomCode] = useState('');
    const [assignedRoom, setAssignedRoom] = useState<string | null>(null);
    const [publicRooms, setPublicRooms] = useState<RoomInfo[]>([]);

    useEffect(() => {
        setRoomCode('');
    }, [gameMode]);

    useEffect(() => {
        socket.on('roomJoined', (roomId) => {
            setAssignedRoom(roomId);
            onJoin(roomId, name.trim(), false, selectedAvatar, gameMode);
        });

        socket.on('roomList', (rooms: RoomInfo[]) => {
            setPublicRooms(rooms);
        });

        return () => {
            socket.off('roomJoined');
            socket.off('roomList');
        };
    }, [name, onJoin, selectedAvatar, gameMode]);

    const fetchRooms = () => {
        socket.connect();
        socket.emit('requestRoomList');
    };

    const handleQuickJoin = () => {
        if (!name.trim()) return;
        const trimmedName = name.trim();
        localStorage.setItem('avatarId', selectedAvatar);
        socket.connect();
        socket.emit('joinRandomRoom', trimmedName, selectedAvatar, gameMode);
    };

    const handleCreatePrivate = () => {
        if (!name.trim()) return;
        const trimmedName = name.trim();
        const newCode = generateRoomCode(gameMode);
        localStorage.setItem('avatarId', selectedAvatar);
        socket.connect();
        onJoin(newCode, trimmedName, true, selectedAvatar, gameMode);
        socket.emit('joinRoom', newCode, trimmedName, true, selectedAvatar, gameMode);
    };

    const handleJoinWithCode = () => {
        if (!name.trim() || !roomCode.trim()) return;
        const trimmedName = name.trim();
        const code = roomCode.trim().toUpperCase();
        localStorage.setItem('avatarId', selectedAvatar);
        socket.connect();
        onJoin(code, trimmedName, true, selectedAvatar, gameMode);
        socket.emit('joinRoom', code, trimmedName, true, selectedAvatar, gameMode);
    };

    const handleJoinSpecificPublicRoom = (roomId: string) => {
        if (!name.trim()) return;
        const trimmedName = name.trim();
        localStorage.setItem('avatarId', selectedAvatar);
        socket.connect();
        onJoin(roomId, trimmedName, false, selectedAvatar, gameMode);
        socket.emit('joinRoom', roomId, trimmedName, false, selectedAvatar, gameMode);
    };

    const handleSpectateRoom = (roomId: string, isPrivate: boolean) => {
        if (!name.trim()) return;
        const trimmedName = name.trim();
        const code = roomId.trim().toUpperCase();
        if (!code) return;
        localStorage.setItem('avatarId', selectedAvatar);
        socket.connect();
        // Save session so a browser refresh re-joins as a spectator.
        onJoin(code, trimmedName, isPrivate, selectedAvatar, gameMode, true);
        socket.emit('joinAsSpectator', code, trimmedName, selectedAvatar);
    };

    const currentAvatar = AVATARS.find(a => a.id === selectedAvatar) || AVATARS[0];

    const handleOpenPublicRooms = () => {
        setView('public_rooms');
        fetchRooms();
    };

    const codeLength = getRoomCodeLength(gameMode);

    return (
        <div className="lobby-container">
            <div className="lobby-box">
                <img
                    src="/EuchreLogo.png"
                    alt="Six Hand Bid Euchre"
                    className="lobby-logo"
                />

                {onLogout && (
                    <button className="logout-btn" onClick={onLogout}>
                        Log Out
                    </button>
                )}

                <div className="avatar-preview" style={{ background: currentAvatar.bg }}>
                    <span className="avatar-preview-emoji">{currentAvatar.emoji}</span>
                </div>

                <div className="avatar-grid">
                    {AVATARS.map(a => (
                        <button
                            key={a.id}
                            className={`avatar-option ${selectedAvatar === a.id ? 'selected' : ''}`}
                            style={{ background: a.bg }}
                            onClick={() => setSelectedAvatar(a.id)}
                            title={a.label}
                        >
                            <span>{a.emoji}</span>
                        </button>
                    ))}
                </div>

                <input
                    className="name-input"
                    placeholder="Enter Your Name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                />

                <div className="mode-picker">
                    <button
                        className={`mode-btn ${gameMode === 'CLASSIC' ? 'active' : ''}`}
                        onClick={() => setGameMode('CLASSIC')}
                    >
                        Classic (6P)
                    </button>
                    <button
                        className={`mode-btn ${gameMode === 'MEGA_DRAFT' ? 'active' : ''}`}
                        onClick={() => setGameMode('MEGA_DRAFT')}
                    >
                        Mega Draft (4P)
                    </button>
                </div>

                {assignedRoom && (
                    <div className="assigned-room">
                        Assigned to room: <strong>{assignedRoom}</strong>
                    </div>
                )}

                {view === 'main' && (
                    <div className="lobby-actions">
                        <button
                            className="action-btn random-btn"
                            onClick={handleQuickJoin}
                            disabled={!name}
                        >
                            ⚡ Quick Play
                        </button>

                        <button
                            className="action-btn public-btn"
                            onClick={handleOpenPublicRooms}
                            disabled={!name}
                        >
                            🌐 Browse Public Rooms
                        </button>

                        <button
                            className="action-btn private-btn"
                            onClick={handleCreatePrivate}
                            disabled={!name}
                        >
                            🔒 Create Private Room
                        </button>

                        <button
                            className="action-btn join-btn"
                            onClick={() => setView('join_code')}
                            disabled={!name}
                        >
                            🔑 Join with Code
                        </button>

                        <button
                            className="action-btn spectate-btn"
                            onClick={() => setView('spectate_code')}
                            disabled={!name}
                        >
                            👀 Spectate Room
                        </button>
                    </div>
                )}

                {view === 'join_code' && (
                    <div className="join-code-view">
                        <p>Enter a room code to join a private game</p>
                        <input
                            className="code-input"
                            placeholder={`${codeLength}-digit code`}
                            value={roomCode}
                            onChange={e => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, codeLength))}
                            maxLength={codeLength}
                            inputMode="numeric"
                        />
                        <div className="code-actions">
                            <button
                                className="back-btn"
                                onClick={() => setView('main')}
                            >
                                Back
                            </button>
                            <button
                                className="action-btn submit-btn"
                                onClick={handleJoinWithCode}
                                disabled={!name || !roomCode}
                            >
                                Join Game
                            </button>
                        </div>
                    </div>
                )}

                {view === 'public_rooms' && (
                    <div className="public-rooms-view">
                        <div className="rooms-header">
                            <h3>Public Rooms</h3>
                            <button className="refresh-btn" onClick={fetchRooms}>🔄</button>
                        </div>

                        <div className="rooms-list">
                            {publicRooms.length === 0 ? (
                                <p className="no-rooms-msg">No public rooms available.<br />Try joining a random game!</p>
                            ) : (
                                publicRooms.map(r => (
                                    <div key={r.roomId} className="room-item">
                                        <div className="room-info">
                                            <span className="room-id">Room {r.roomId}</span>
                                            <span className="player-count">👥 {r.playerCount}/{r.maxPlayers} Players</span>
                                            <span className="player-count">{r.gameMode === 'MEGA_DRAFT' ? 'Mega Draft' : 'Classic'}</span>
                                        </div>
                                        <div className="room-actions">
                                            <button
                                                className="spectate-room-btn"
                                                onClick={() => handleSpectateRoom(r.roomId, false)}
                                                title="Watch this room without taking a seat"
                                            >
                                                👀
                                            </button>
                                            <button
                                                className="join-room-btn"
                                                onClick={() => handleJoinSpecificPublicRoom(r.roomId)}
                                            >
                                                Join
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="code-actions">
                            <button className="back-btn" onClick={() => setView('main')}>
                                Back
                            </button>
                        </div>
                    </div>
                )}

                {view === 'spectate_code' && (
                    <div className="join-code-view">
                        <p>Enter a room code to watch a game (no seat will be taken)</p>
                        <input
                            className="code-input"
                            placeholder={`${codeLength}-digit code`}
                            value={roomCode}
                            onChange={e => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, codeLength))}
                            maxLength={codeLength}
                            inputMode="numeric"
                        />
                        <div className="code-actions">
                            <button
                                className="back-btn"
                                onClick={() => setView('main')}
                            >
                                Back
                            </button>
                            <button
                                className="action-btn submit-btn"
                                onClick={() => handleSpectateRoom(roomCode, true)}
                                disabled={!name || !roomCode}
                            >
                                Spectate
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
