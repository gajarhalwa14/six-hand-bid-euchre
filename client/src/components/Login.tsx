import React, { useState } from 'react';
import './Login.css';
import { login, persistAuthSession, signup, updateUser } from '../api';

const REMEMBER_KEY = 'euchre_remember_username';

interface LoginProps {
    onLogin: (username: string, displayName: string, userId?: string) => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
    const [mode, setMode] = useState<'login' | 'signup'>('login');
    const [username, setUsername] = useState(() => localStorage.getItem(REMEMBER_KEY) || '');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [rememberMe, setRememberMe] = useState(!!localStorage.getItem(REMEMBER_KEY));
    const [showPassword, setShowPassword] = useState(false);
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

            if (rememberMe) {
                localStorage.setItem(REMEMBER_KEY, username);
            } else {
                localStorage.removeItem(REMEMBER_KEY);
            }

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
        <div className="login-page">
            <div className="login-card">
                <img
                    src="/EuchreLogo.png"
                    alt="Six Hand Bid Euchre"
                    className="login-logo"
                />

                {mode === 'login' ? (
                    <>
                        <h2 className="login-welcome">WELCOME BACK</h2>
                        <p className="login-subtitle">Log in to continue your game.</p>
                    </>
                ) : (
                    <>
                        <h2 className="login-welcome">CREATE ACCOUNT</h2>
                        <p className="login-subtitle">Join the table and start playing.</p>
                    </>
                )}

                <form onSubmit={handleSubmit} className="login-form">
                    {mode === 'signup' && (
                        <div className="login-field">
                            <span className="login-field-icon" aria-hidden="true">✦</span>
                            <input
                                type="text"
                                placeholder="Display Name"
                                value={displayName}
                                onChange={e => setDisplayName(e.target.value)}
                                required
                                className="login-input"
                                autoComplete="name"
                            />
                        </div>
                    )}

                    <div className="login-field">
                        <span className="login-field-icon" aria-hidden="true">👤</span>
                        <input
                            type="text"
                            placeholder="Username or Email"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            required
                            className="login-input"
                            autoComplete="username"
                        />
                    </div>

                    <div className="login-field">
                        <span className="login-field-icon" aria-hidden="true">🔒</span>
                        <input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            minLength={8}
                            className="login-input login-input--password"
                            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                        />
                        <button
                            type="button"
                            className="login-toggle-pw"
                            onClick={() => setShowPassword(v => !v)}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                            {showPassword ? '🙈' : '👁'}
                        </button>
                    </div>

                    {mode === 'login' && (
                        <div className="login-options">
                            <label className="login-remember">
                                <input
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={e => setRememberMe(e.target.checked)}
                                />
                                Remember me
                            </label>
                            <button
                                type="button"
                                className="login-forgot"
                                onClick={() => setError('Password reset is not available yet — contact support.')}
                            >
                                Forgot Password?
                            </button>
                        </div>
                    )}

                    {error && <div className="login-error">{error}</div>}

                    <button type="submit" className="login-submit" disabled={loading}>
                        {loading ? 'Please wait…' : (mode === 'login' ? 'LOG IN' : 'CREATE ACCOUNT')}
                    </button>
                </form>

                {mode === 'login' && (
                    <>
                        <div className="login-divider">
                            <span>OR</span>
                        </div>
                        <button
                            type="button"
                            className="login-create-btn"
                            onClick={() => { setMode('signup'); setError(null); }}
                        >
                            <span aria-hidden="true">👤+</span> CREATE ACCOUNT
                        </button>
                    </>
                )}

                {mode === 'signup' && (
                    <button
                        type="button"
                        className="login-back-link"
                        onClick={() => { setMode('login'); setError(null); }}
                    >
                        ← Back to Log In
                    </button>
                )}

                <p className="login-legal">
                    By continuing, you agree to our{' '}
                    <a href="#" onClick={e => e.preventDefault()}>Terms of Service</a>
                    {' '}and{' '}
                    <a href="#" onClick={e => e.preventDefault()}>Privacy Policy</a>.
                </p>
            </div>
        </div>
    );
};
