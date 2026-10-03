'use client';

import { useEffect, useState } from 'react';
import styles from './admins.module.scss';
import { createUserAction, updateUserAction } from '@/app/actions/admins';

export type UserFormUser = {
  id: string;
  full_name: string;
  email: string;
  role_id: number;
  is_active: boolean | null;
  country_code: string | null;
  mobile_number: string | null;
};

export type UserFormRole = {
  id: number;
  name: string;
};

type UserFormModalProps = {
  open: boolean;
  mode: 'create' | 'edit';
  user: UserFormUser | null;
  roles: UserFormRole[];
  formatRoleName: (name: string) => string;
  onClose: () => void;
  onSuccess: () => void;
};

export function UserFormModal({
  open,
  mode,
  user,
  roles,
  formatRoleName,
  onClose,
  onSuccess,
}: UserFormModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSubmitting(false);
    setError(null);
    if (mode === 'create') {
      setFullName('');
      setEmail('');
      setPassword('');
      setRoleId('');
      setCountryCode('');
      setMobileNumber('');
      setIsActive(true);
    } else if (user) {
      setFullName(user.full_name);
      setEmail(user.email);
      setPassword('');
      setRoleId(String(user.role_id));
      setCountryCode(user.country_code ?? '');
      setMobileNumber(user.mobile_number ?? '');
      setIsActive(user.is_active ?? true);
    }
  }, [open, mode, user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    if (!fullName.trim()) {
      setError('Full name is required');
      return;
    }
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (!roleId) {
      setError('Role is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (mode === 'create') {
        if (!password) {
          setError('Password is required');
          setSubmitting(false);
          return;
        }

        const body = {
          full_name: fullName.trim(),
          email: email.trim(),
          password,
          role_id: Number(roleId),
          ...(countryCode.trim() && { country_code: countryCode.trim() }),
          ...(mobileNumber.trim() && { mobile_number: mobileNumber.trim() }),
          is_active: isActive,
        };

        const result = await createUserAction(body);
        if (!result.ok) throw new Error(result.error);
      } else if (mode === 'edit' && user) {
        const updateBody: Record<string, unknown> = {};
        if (fullName.trim() !== user.full_name) updateBody.full_name = fullName.trim();
        if ((user.is_active ?? true) !== isActive) updateBody.is_active = isActive;
        if ((user.country_code ?? '') !== countryCode.trim()) {
          updateBody.country_code = countryCode.trim() || null;
        }
        if ((user.mobile_number ?? '') !== mobileNumber.trim()) {
          updateBody.mobile_number = mobileNumber.trim() || null;
        }
        if (password) updateBody.password = password;

        const result = await updateUserAction(user.id, updateBody as Parameters<typeof updateUserAction>[1]);
        if (!result.ok) throw new Error(result.error);
      }

      onSuccess();
      onClose();
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : 'Unable to submit form');
    }
  }

  if (!open) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>
              {mode === 'create' ? 'Create user' : 'Edit user'}
            </h2>
            <p className={styles.modalSubtitle}>
              {mode === 'create'
                ? 'Provide details to create a new admin user.'
                : 'Update the details of this admin user.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={styles.modalClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {error && <p className={styles.modalError}>{error}</p>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div>
            <label className={styles.label}>
              Full name<span className={styles.required}> *</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={styles.input}
            />
          </div>

          <div>
            <label className={styles.label}>
              Email<span className={styles.required}> *</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={mode === 'edit'}
              className={styles.input}
            />
          </div>

          <div>
            <label className={styles.label}>
              {mode === 'create' ? 'Password' : 'New password (optional)'}
              {mode === 'create' && <span className={styles.required}> *</span>}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'edit' ? 'Leave blank to keep current password' : ''}
              className={styles.input}
            />
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label}>
                Role<span className={styles.required}> *</span>
              </label>
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                disabled={mode === 'edit'}
                className={styles.select}
              >
                <option value="">Select role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {formatRoleName(role.name)}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.checkboxRow}>
              <input
                id="user-form-is_active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <label htmlFor="user-form-is_active">Active</label>
            </div>
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label}>Country code</label>
              <input
                type="text"
                placeholder="91"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className={styles.input}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Mobile number</label>
              <input
                type="text"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                className={styles.input}
              />
            </div>
          </div>

          <div className={styles.formActions}>
            <button
              type="button"
              onClick={onClose}
              className={styles.btnCancel}
            >
              Cancel
            </button>
            <button type="submit" disabled={submitting} className={styles.btnSubmit}>
              {submitting
                ? mode === 'create'
                  ? 'Creating…'
                  : 'Saving…'
                : mode === 'create'
                  ? 'Create user'
                  : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
