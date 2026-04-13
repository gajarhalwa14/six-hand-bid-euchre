import React, { useState } from 'react';
import './Login.css';

interface LoginProps {
    onLogin: (email: string, displayName: string) => void;
}

const API_BASE = import.meta.env.DEV
    ? `http://${window.location.hostname}:3000`
    : '';

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
    const [mode, setMode] = useState<'login' | 'signup'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const endpoint = mode === 'login' ? '/api/login' : '/api/signup';
            const body: Record<string, string> = { email, password };
            if (mode === 'signup') body.displayName = displayName;

            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Something went wrong');
                return;
            }

            localStorage.setItem('euchre_user', JSON.stringify(data));
            onLogin(data.email, data.displayName);
        } catch {
            setError('Could not connect to server');
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
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                        className="login-input"
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        minLength={4}
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
