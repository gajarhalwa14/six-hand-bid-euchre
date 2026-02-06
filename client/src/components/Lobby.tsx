import React, { useState } from 'react';
import { socket } from '../socket';
import './Lobby.css';

export const Lobby: React.FC = () => {
    const [room, setRoom] = useState('');
    const [name, setName] = useState('');

    const handleJoin = () => {
        if (room && name) {
            socket.connect();
            socket.emit('joinRoom', room, name);
        }
    };

    return (
        <div className="lobby-container">
            <div className="lobby-box">
                <h1>Six-Hand Bid Euchre</h1>
                <input
                    placeholder="Enter Room Code"
                    value={room}
                    onChange={e => setRoom(e.target.value)}
                />
                <input
                    placeholder="Enter Your Name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                />
                <button onClick={handleJoin} disabled={!room || !name}>
                    Join Game
                </button>
            </div>
        </div>
    );
};
