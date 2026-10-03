'use client';

import { useEffect, useState } from 'react';
import {
  createAppConfigurationAction,
  updateAppConfigurationAction,
  type AppConfigurationRow,
} from '@/app/actions/app-configurations';
import styles from './app-config.module.scss';

type AppConfigFormModalProps = {
  open: boolean;
  mode: 'create' | 'edit';
  row: AppConfigurationRow | null;
  onClose: () => void;
  onSuccess: () => void;
};

export function AppConfigFormModal({ open, mode, row, onClose, onSuccess }: AppConfigFormModalProps) {
  const [platform, setPlatform] = useState('');
  const [appName, setAppName] = useState('');
  const [storeUrl, setStoreUrl] = useState('');
  const [currentVersion, setCurrentVersion] = useState('');
  const [minimumVersion, setMinimumVersion] = useState('');
  const [forceUpdate, setForceUpdate] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === 'edit' && row) {
      setPlatform(row.platform);
      setAppName(row.app_name ?? '');
      setStoreUrl(row.store_url);
      setCurrentVersion(row.current_version ?? '');
      setMinimumVersion(row.minimum_supported_version ?? '');
      setForceUpdate(Boolean(row.force_update));
      setIsActive(row.is_active !== false);
    } else {
      setPlatform('');
      setAppName('');
      setStoreUrl('');
      setCurrentVersion('');
      setMinimumVersion('');
      setForceUpdate(false);
      setIsActive(true);
    }
  }, [open, mode, row]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'create') {
        const result = await createAppConfigurationAction({
          platform: platform.trim(),
          app_name: appName.trim() || undefined,
          store_url: storeUrl.trim(),
          current_version: currentVersion.trim() || undefined,
          minimum_supported_version: minimumVersion.trim() || undefined,
          force_update: forceUpdate,
          is_active: isActive,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
      } else if (row) {
        const result = await updateAppConfigurationAction(row.id, {
          app_name: appName.trim() || undefined,
          store_url: storeUrl.trim(),
          current_version: currentVersion.trim() || undefined,
          minimum_supported_version: minimumVersion.trim() || undefined,
          force_update: forceUpdate,
          is_active: isActive,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }
      onSuccess();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-config-modal-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h2 id="app-config-modal-title" className={styles.modalTitle}>
            {mode === 'create' ? 'New app configuration' : 'Edit app configuration'}
          </h2>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.formStack}>
          <label className={styles.label}>
            Platform
            <input
              className={styles.input}
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              maxLength={20}
              required={mode === 'create'}
              disabled={mode === 'edit'}
              placeholder="e.g. ios, android"
            />
          </label>
          {mode === 'edit' && (
            <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '-0.25rem 0 0' }}>
              Platform cannot be changed after creation.
            </p>
          )}

          <label className={styles.label}>
            App name
            <input
              className={styles.input}
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              maxLength={150}
              placeholder="Optional display name"
            />
          </label>

          <label className={styles.label}>
            Store URL
            <input
              className={styles.input}
              type="url"
              value={storeUrl}
              onChange={(e) => setStoreUrl(e.target.value)}
              required
              placeholder="https://…"
            />
          </label>

          <label className={styles.label}>
            Current version
            <input
              className={styles.input}
              value={currentVersion}
              onChange={(e) => setCurrentVersion(e.target.value)}
              maxLength={20}
              placeholder="e.g. 1.2.0"
            />
          </label>

          <label className={styles.label}>
            Minimum supported version
            <input
              className={styles.input}
              value={minimumVersion}
              onChange={(e) => setMinimumVersion(e.target.value)}
              maxLength={20}
              placeholder="e.g. 1.0.0"
            />
          </label>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={forceUpdate}
              onChange={(e) => setForceUpdate(e.target.checked)}
            />
            Force update
          </label>

          <label className={styles.checkboxRow}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>

          {error && <p className={styles.errorText}>{error}</p>}

          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={submitting}>
              {submitting ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
