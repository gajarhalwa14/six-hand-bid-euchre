import React, { useEffect, useState } from 'react';
import { socket } from '../socket';
import type { RoomInfo } from '../types';
import AVATARS from '../avatars';
import './Lobby.css';

interface LobbyProps {
    onJoin: (roomId: string, name: string, isPrivate: boolean, avatarId?: string) => void;
    defaultName?: string;
    defaultAvatarId?: string;
    onLogout?: () => void;
}

export const Lobby: React.FC<LobbyProps> = ({ onJoin, defaultName, defaultAvatarId, onLogout }) => {
    const [name, setName] = useState(defaultName || '');
    const [selectedAvatar, setSelectedAvatar] = useState<string>(defaultAvatarId || AVATARS[0].id);
    const [view, setView] = useState<'main' | 'join_code' | 'public_rooms'>('main');
    const [roomCode, setRoomCode] = useState('');
    const [assignedRoom, setAssignedRoom] = useState<string | null>(null);
    const [publicRooms, setPublicRooms] = useState<RoomInfo[]>([]);

    useEffect(() => {
        socket.on('roomJoined', (roomId) => {
            setAssignedRoom(roomId);
            onJoin(roomId, name.trim(), false);
        });

        socket.on('roomList', (rooms: RoomInfo[]) => {
            setPublicRooms(rooms);
        });

        return () => {
            socket.off('roomJoined');
            socket.off('roomList');
        };
    }, [name, onJoin]);

    const fetchRooms = () => {
        socket.connect();
        socket.emit('requestRoomList');
    };

    const handleQuickJoin = () => {
        if (!name.trim()) return;
        const trimmedName = name.trim();
        localStorage.setItem('avatarId', selectedAvatar);
        socket.connect();
        socket.emit('joinRandomRoom', trimmedName, selectedAvatar);
    };

    const handleCreatePrivate = () => {
        if (!name.trim()) return;
        const trimmedName = name.trim();
        const newCode = Math.random().toString(36).slice(2, 8).toUpperCase();
        localStorage.setItem('avatarId', selectedAvatar);
        socket.connect();
        onJoin(newCode, trimmedName, true, selectedAvatar);
        socket.emit('joinRoom', newCode, trimmedName, true, selectedAvatar);
    };

    const handleJoinWithCode = () => {
        if (!name.trim() || !roomCode.trim()) return;
        const trimmedName = name.trim();
        const code = roomCode.trim().toUpperCase();
        localStorage.setItem('avatarId', selectedAvatar);
        socket.connect();
        onJoin(code, trimmedName, true, selectedAvatar);
        socket.emit('joinRoom', code, trimmedName, true, selectedAvatar);
    };

    const handleJoinSpecificPublicRoom = (roomId: string) => {
        if (!name.trim()) return;
        const trimmedName = name.trim();
        localStorage.setItem('avatarId', selectedAvatar);
        socket.connect();
        onJoin(roomId, trimmedName, false, selectedAvatar);
        socket.emit('joinRoom', roomId, trimmedName, false, selectedAvatar);
    };

    const currentAvatar = AVATARS.find(a => a.id === selectedAvatar) || AVATARS[0];

    const handleOpenPublicRooms = () => {
        setView('public_rooms');
        fetchRooms();
    };

    return (
        <div className="lobby-container">
            <div className="lobby-box">
                <h1>Six-Hand Bid Euchre</h1>

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
                    </div>
                )}

                {view === 'join_code' && (
                    <div className="join-code-view">
                        <p>Enter a room code to join a private game</p>
                        <input
                            className="code-input"
                            placeholder="Room Code"
                            value={roomCode}
                            onChange={e => setRoomCode(e.target.value)}
                            maxLength={6}
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
                                            <span className="player-count">👥 {r.playerCount}/6 Players</span>
                                        </div>
                                        <button
                                            className="join-room-btn"
                                            onClick={() => handleJoinSpecificPublicRoom(r.roomId)}
                                        >
                                            Join
                                        </button>
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
            </div>
        </div>
    );
};
