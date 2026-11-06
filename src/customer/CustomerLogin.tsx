import React, { useState } from 'react';
import type { UserProfile } from '../auth/authStore';
import { authStore } from '../auth/authStore';

interface CustomerLoginProps {
  onSuccess: (user: UserProfile) => void;
}

export const CustomerLogin: React.FC<CustomerLoginProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed. Please try again.');
      } else {
        authStore.setUser(data.user, data.token || 'customer-session');
        onSuccess(data.user as UserProfile);
      }
    } catch {
      setError('Could not reach server. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cust-login-shell">
      <div className="cust-login-top">
        <span className="cust-login-logo">THE STRANDED NETWORK</span>
        <span className="cust-login-eyebrow">Passenger Portal</span>
      </div>

      <div className="cust-login-body">
        <h1 className="cust-login-heading">Sign in</h1>
        <p className="cust-login-sub">Access your journey updates and alternatives.</p>

        <form className="cust-login-form" onSubmit={handleSubmit} noValidate>
          <label className="cust-field-label" htmlFor="cust-email">Email</label>
          <input
            id="cust-email"
            className="cust-field-input"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />

          <label className="cust-field-label" htmlFor="cust-password">Password</label>
          <input
            id="cust-password"
            className="cust-field-input"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />

          {error && <p className="cust-login-error">{error}</p>}

          <button
            type="submit"
            className="cust-login-submit"
            disabled={loading}
          >
            {loading ? 'SIGNING IN…' : 'SIGN IN'}
          </button>
        </form>
      </div>

      <div className="cust-login-footer">
        <span>No account? Contact your station operator.</span>
      </div>
    </div>
  );
};
