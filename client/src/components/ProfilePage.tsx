import React from 'react';
import { Link, useParams } from 'react-router-dom';

export const ProfilePage: React.FC = () => {
    const { userId } = useParams();

    return (
        <div className="lobby-container">
            <div className="lobby-box">
                <h2 className="room-page-title">Player Profile</h2>
                <p className="room-page-subtitle">
                    Profile pages are coming soon.
                </p>
                <p className="room-page-subtitle">
                    User ID: <strong>{userId}</strong>
                </p>
                <Link to="/" className="back-btn room-page-back">
                    Back to Lobby
                </Link>
            </div>
        </div>
    );
};
