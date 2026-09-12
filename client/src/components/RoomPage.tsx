import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { socket } from '../socket';
import type { GameMode } from '../types';
import AVATARS from '../avatars';
import './Lobby.css';

interface RoomPageProps {
    roomId: string;
    spectate?: boolean;
    defaultName: string;
    defaultAvatarId?: string;
    onJoin: (
        roomId: string,
        name: string,
        isPrivate: boolean,
        avatarId?: string,
        gameMode?: GameMode,
        asSpectator?: boolean,
    ) => void;
}

export const RoomPage: React.FC<RoomPageProps> = ({
    roomId,
    spectate = false,
    defaultName,
    defaultAvatarId,
    onJoin,
}) => {
    const [name, setName] = useState(defaultName);
    const [selectedAvatar, setSelectedAvatar] = useState(defaultAvatarId || AVATARS[0].id);
    const [joining, setJoining] = useState(false);

    const currentAvatar = AVATARS.find(a => a.id === selectedAvatar) || AVATARS[0];

    const handleJoin = () => {
        if (!name.trim() || joining) return;

        const trimmedName = name.trim();
        setJoining(true);
        localStorage.setItem('avatarId', selectedAvatar);
        socket.connect();

        if (spectate) {
            onJoin(roomId, trimmedName, true, selectedAvatar, 'CLASSIC', true);
            socket.emit('joinAsSpectator', roomId, trimmedName, selectedAvatar);
            return;
        }

        onJoin(roomId, trimmedName, true, selectedAvatar, 'CLASSIC');
        socket.emit('joinRoom', roomId, trimmedName, true, selectedAvatar, 'CLASSIC');
    };

    return (
        <div className="lobby-container">
            <div className="lobby-box">
                <img
                    src="/EuchreLogo.png"
                    alt="Six Hand Bid Euchre"
                    className="lobby-logo"
                />

                <h2 className="room-page-title">
                    {spectate ? 'Spectate Room' : 'Join Room'} <strong>{roomId}</strong>
                </h2>
                <p className="room-page-subtitle">
                    {spectate
                        ? 'Watch the game without taking a seat.'
                        : 'Confirm your name and avatar, then join the table.'}
                </p>

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

                <div className="lobby-actions">
                    <button
                        className="action-btn submit-btn"
                        onClick={handleJoin}
                        disabled={!name.trim() || joining}
                    >
                        {joining ? 'Joining…' : spectate ? 'Spectate Game' : 'Join Game'}
                    </button>
                    <Link to="/" className="back-btn room-page-back">
                        Back to Lobby
                    </Link>
                </div>
            </div>
        </div>
    );
};
