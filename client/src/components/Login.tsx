import React, { useState } from 'react';
import './Login.css';
import { login, persistAuthSession, signup, updateUser } from '../api';

interface LoginProps {
    onLogin: (username: string, displayName: string, userId?: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
    const [mode, setMode] = useState<'login' | 'signup'>('login');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            if (mode === 'signup') {
                await signup(username, displayName, password);
            }

            let { user, token } = await login(username, password);
            persistAuthSession(user, token);

            // On signup, immediately exercise one protected route and ensure
            // the backend/frontend token flow is fully wired.
            if (mode === 'signup' && displayName.trim() && displayName.trim() !== user.display_name) {
                user = await updateUser(user.user_id, { display_name: displayName.trim() });
                persistAuthSession(user, token);
            }
            onLogin(user.username, user.display_name, user.user_id);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not connect to server');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-box">
                <h1 className="login-title">Six-Hand Bid Euchre</h1>

                <div className="login-tabs">
                    <button
                        className={`tab ${mode === 'login' ? 'active' : ''}`}
                        onClick={() => { setMode('login'); setError(null); }}
                    >
                        Log In
                    </button>
                    <button
                        className={`tab ${mode === 'signup' ? 'active' : ''}`}
                        onClick={() => { setMode('signup'); setError(null); }}
                    >
                        Sign Up
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="login-form">
                    {mode === 'signup' && (
                        <input
                            type="text"
                            placeholder="Display Name"
                            value={displayName}
                            onChange={e => setDisplayName(e.target.value)}
                            required
                            className="login-input"
                        />
                    )}
                    <input
                        type="text"
                        placeholder="Username"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        required
                        className="login-input"
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        minLength={8}
                        className="login-input"
                    />

                    {error && <div className="login-error">{error}</div>}

                    <button type="submit" className="login-submit" disabled={loading}>
                        {loading ? 'Please wait...' : (mode === 'login' ? 'Log In' : 'Create Account')}
                    </button>
                </form>
            </div>
        </div>
    );
};
