'use client';

import { useEffect, useState } from 'react';
import { ImageUploadField } from '@/components/VenueForm/ImageUploadField';
import { useSearchParams } from 'next/navigation';
import { getMyProfileAction, updateMyProfileAction } from '@/app/actions/profile';
import styles from './profile.module.scss';

type ProfileForm = {
  full_name: string;
  email: string;
  role_name: string;
  mobile_number: string;
  country_code: string;
  avatar_url: string;
  instagram_id: string;
};

function toForm(user: {
  full_name: string;
  email: string;
  role_name: string;
  mobile_number: string | null;
  country_code: string | null;
  avatar_url: string | null;
  instagram_id: string | null;
}): ProfileForm {
  return {
    full_name: user.full_name ?? '',
    email: user.email ?? '',
    role_name: user.role_name ?? '',
    mobile_number: user.mobile_number ?? '',
    country_code: user.country_code ?? '',
    avatar_url: user.avatar_url ?? '',
    instagram_id: user.instagram_id ?? '',
  };
}

export default function ProfilePage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [initialForm, setInitialForm] = useState<ProfileForm | null>(null);
  const [form, setForm] = useState<ProfileForm>({
    full_name: '',
    email: '',
    role_name: '',
    mobile_number: '',
    country_code: '',
    avatar_url: '',
    instagram_id: '',
  });

  useEffect(() => {
    const mode = searchParams.get('mode');
    if (mode === 'edit') setIsEditMode(true);
  }, [searchParams]);

  useEffect(() => {
    getMyProfileAction()
      .then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const nextForm = toForm(res.data);
        setForm(nextForm);
        setInitialForm(nextForm);
      })
      .finally(() => setLoading(false));
  }, []);

  function handleCancelEdit() {
    if (initialForm) setForm(initialForm);
    setError(null);
    setSuccess(null);
    setIsEditMode(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSuccess(null);
    setError(null);
    if (!form.full_name.trim()) {
      setError('Full name is required');
      return;
    }
    setSaving(true);
    try {
      const payload: {
        full_name: string;
        mobile_number?: string;
        country_code?: string;
        avatar_url: string | null;
        instagram_id: string | null;
      } = {
        full_name: form.full_name.trim(),
        mobile_number: form.mobile_number.trim() || undefined,
        country_code: form.country_code.trim() || undefined,
        avatar_url: form.avatar_url.trim() || null,
        instagram_id: form.instagram_id.trim() || null,
      };
      const res = await updateMyProfileAction(payload);
      if (!res.ok) {
        throw new Error(res.error);
      }
      const normalized: ProfileForm = {
        ...form,
        full_name: form.full_name.trim(),
        mobile_number: form.mobile_number.trim(),
        country_code: form.country_code.trim(),
        avatar_url: form.avatar_url.trim(),
        instagram_id: form.instagram_id.trim(),
      };
      setForm(normalized);
      setInitialForm(normalized);
      setSuccess('Profile updated successfully.');
      setIsEditMode(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className={styles.loading}>Loading profile…</p>;

  return (
    <div className={styles.pageWrap}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>My Profile</h1>
          <p className={styles.subtitle}>View and manage your account information.</p>
        </div>
        {!isEditMode ? (
          <button type="button" className={styles.primaryBtn} onClick={() => setIsEditMode(true)}>
            Edit profile
          </button>
        ) : (
          <button type="button" className={styles.secondaryBtn} onClick={handleCancelEdit} disabled={saving}>
            Cancel
          </button>
        )}
      </div>

      {error && <p className={styles.errorText}>{error}</p>}
      {success && <p className={styles.successText}>{success}</p>}

      <form onSubmit={handleSave} className={styles.card}>
        <div className={styles.topSection}>
          <div className={styles.avatarWrap}>
            {form.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- dynamic user-provided profile image URL
              <img src={form.avatar_url} alt={`${form.full_name} profile`} className={styles.avatarImg} />
            ) : (
              <div className={styles.avatarFallback}>
                {(form.full_name || 'U')
                  .trim()
                  .split(/\s+/)
                  .map((x) => x[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </div>
            )}
          </div>
          <div className={styles.topMeta}>
            <h2>{form.full_name || 'Unnamed user'}</h2>
            <p>{form.email}</p>
            <span className={styles.roleBadge}>{form.role_name}</span>
          </div>
        </div>

        <div className={styles.grid}>
          <div className={styles.field}>
            <label>Full name</label>
            {isEditMode ? (
              <input
                type="text"
                value={form.full_name}
                onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
                className={styles.input}
              />
            ) : (
              <div className={styles.value}>{form.full_name || '—'}</div>
            )}
          </div>

          <div className={styles.field}>
            <label>Email</label>
            <div className={styles.value}>{form.email || '—'}</div>
          </div>

          <div className={styles.field}>
            <label>Role</label>
            <div className={styles.value}>{form.role_name || '—'}</div>
          </div>

          <div className={styles.field}>
            <label>Instagram ID</label>
            {isEditMode ? (
              <input
                type="text"
                value={form.instagram_id}
                onChange={(e) => setForm((p) => ({ ...p, instagram_id: e.target.value }))}
                className={styles.input}
                placeholder="@username"
              />
            ) : (
              <div className={styles.value}>{form.instagram_id || '—'}</div>
            )}
          </div>

          <div className={styles.field}>
            <label>Country code</label>
            {isEditMode ? (
              <input
                type="text"
                value={form.country_code}
                onChange={(e) => setForm((p) => ({ ...p, country_code: e.target.value }))}
                className={styles.input}
                placeholder="+91"
              />
            ) : (
              <div className={styles.value}>{form.country_code || '—'}</div>
            )}
          </div>

          <div className={styles.field}>
            <label>Mobile number</label>
            {isEditMode ? (
              <input
                type="text"
                value={form.mobile_number}
                onChange={(e) => setForm((p) => ({ ...p, mobile_number: e.target.value }))}
                className={styles.input}
                placeholder="9876543210"
              />
            ) : (
              <div className={styles.value}>{form.mobile_number || '—'}</div>
            )}
          </div>
        </div>

        {isEditMode && (
          <div className={styles.imageSection}>
            <ImageUploadField
              value={form.avatar_url}
              onChange={(url) => setForm((p) => ({ ...p, avatar_url: url }))}
              label="Profile picture"
              uploadPrefix="uploads"
            />
          </div>
        )}

        {isEditMode && (
          <div className={styles.actions}>
            <button type="submit" className={styles.primaryBtn} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={handleCancelEdit} disabled={saving}>
              Cancel
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
