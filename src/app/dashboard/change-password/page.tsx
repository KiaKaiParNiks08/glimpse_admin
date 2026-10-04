'use client';

import { useState } from 'react';
import { useRouteProgress } from '@/components/navigation/NavigationProvider';
import { changeMyPasswordAction } from '@/app/actions/profile';
import styles from '../profile/profile.module.scss';

export default function ChangePasswordPage() {
  const { pendingHref, navigate } = useRouteProgress();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!password) {
      setError('New password is required');
      return;
    }
    if (password.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Confirm password does not match');
      return;
    }

    setSaving(true);
    try {
      const res = await changeMyPasswordAction(password);
      if (!res.ok) throw new Error(res.error);
      setPassword('');
      setConfirmPassword('');
      setSuccess('Password updated successfully.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.pageWrap}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Change Password</h1>
          <p className={styles.subtitle}>Set a new password for your account.</p>
        </div>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={() => navigate('/dashboard/profile')}
          aria-busy={pendingHref === '/dashboard/profile' || undefined}
        >
          Back to profile
        </button>
      </div>

      {error && <p className={styles.errorText}>{error}</p>}
      {success && <p className={styles.successText}>{success}</p>}

      <form onSubmit={handleSubmit} className={styles.card} style={{ maxWidth: '36rem' }}>
        <div className={styles.grid} style={{ gridTemplateColumns: '1fr' }}>
          <div className={styles.field}>
            <label>New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              placeholder="Minimum 8 characters"
            />
          </div>
          <div className={styles.field}>
            <label>Confirm password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={styles.input}
              placeholder="Re-enter new password"
            />
          </div>
        </div>
        <div className={styles.actions}>
          <button type="submit" className={styles.primaryBtn} disabled={saving}>
            {saving ? 'Saving…' : 'Update password'}
          </button>
        </div>
      </form>
    </div>
  );
}
