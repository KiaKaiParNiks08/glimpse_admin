'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './login.module.css';
import { ADMIN_SESSION_KEY } from '@/lib/admin-auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      type LoginResponseJson = {
        message?: string;
        data?: { token?: string } | null;
        token?: string;
      } | null;
      const data = (await res.json().catch(() => null)) as LoginResponseJson;

      if (!res.ok) {
        setError(data?.message ?? 'Login failed. Please try again.');
        return;
      }

      const token = data?.data?.token ?? data?.token ?? null;
      if (token) {
        sessionStorage.setItem(ADMIN_SESSION_KEY, token);
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Never redirect from here based on the sessionStorage token: only the cookie (checked in
  // login/layout.tsx) decides, otherwise a stale token bounces between /login and /dashboard.
  return (
    <main className={styles.loginPage}>
      <div className={styles.loginCard}>
        <h1 className={styles.loginTitle}>Glimpsapp Admin</h1>
        <p className={styles.loginSubtitle}>
          Sign in as <strong>SuperAdmin</strong> or <strong>Event Admin</strong>
        </p>

        <form onSubmit={handleSubmit} className={styles.loginForm}>
          {error && (
            <div className={styles.loginError} role="alert">
              {error}
            </div>
          )}

          <label className={styles.loginLabel} htmlFor="email">
            Email
          </label>
          <div className={styles.inputWithIcon}>
            <span className={styles.inputIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                <path d="M4 6h16v12H4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M4 8l8 6 8-6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            </span>
            <input
              id="email"
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              className={styles.loginInput}
              autoComplete="email"
              required
              disabled={loading}
            />
          </div>

          <label className={styles.loginLabel} htmlFor="password">
            Password
          </label>
          <div className={styles.inputWithIcon}>
            <span className={styles.inputIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                <path
                  d="M7 11V8a5 5 0 0 1 10 0v3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <rect x="6" y="11" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
              </svg>
            </span>
            <input
              id="password"
              type="password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={styles.loginInput}
              autoComplete="current-password"
              required
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className={styles.loginButton}
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
