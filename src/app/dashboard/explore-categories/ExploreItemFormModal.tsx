'use client';

import { useState, useEffect } from 'react';
import styles from './explore-categories.module.scss';
import type { ExploreItemListItem } from '@/app/actions/explore';

export type ExploreItemFormValues = {
  title: string;
  description: string;
  address: string;
  city: string;
  state: string;
  country: string;
  latitude: string;
  longitude: string;
};

type ExploreItemFormModalProps = {
  open: boolean;
  mode: 'create' | 'edit';
  /** Passed by parent for context; parent uses it when calling onSubmit. */
  categoryId: string;
  item: ExploreItemListItem | null;
  onClose: () => void;
  onSubmit: (values: ExploreItemFormValues) => Promise<void>;
};

const emptyForm: ExploreItemFormValues = {
  title: '',
  description: '',
  address: '',
  city: '',
  state: '',
  country: '',
  latitude: '',
  longitude: '',
};

export function ExploreItemFormModal({
  open,
  mode,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- parent uses categoryId when calling createExploreItemAction
  categoryId,
  item,
  onClose,
  onSubmit,
}: ExploreItemFormModalProps) {
  const [form, setForm] = useState<ExploreItemFormValues>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === 'edit' && item) {
      setForm({
        title: item.title ?? '',
        description: item.description ?? '',
        address: item.address ?? '',
        city: item.city ?? '',
        state: item.state ?? '',
        country: item.country ?? '',
        latitude: item.latitude != null ? String(item.latitude) : '',
        longitude: item.longitude != null ? String(item.longitude) : '',
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, mode, item]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const title = form.title.trim();
    const description = form.description.trim();
    const address = form.address.trim();
    const latStr = form.latitude.trim();
    const lngStr = form.longitude.trim();

    if (!title) {
      setError('Title is required');
      return;
    }
    if (!description) {
      setError('Description is required');
      return;
    }
    if (!address) {
      setError('Address is required');
      return;
    }
    const city = form.city.trim();
    const state = form.state.trim();
    if (!city) {
      setError('City is required');
      return;
    }
    if (!state) {
      setError('State is required');
      return;
    }
    if (!latStr) {
      setError('Latitude is required');
      return;
    }
    if (!lngStr) {
      setError('Longitude is required');
      return;
    }
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (Number.isNaN(lat)) {
      setError('Latitude must be a valid number');
      return;
    }
    if (Number.isNaN(lng)) {
      setError('Longitude must be a valid number');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        ...form,
        title,
        description,
        address,
        city,
        state,
        country: form.country.trim() || '',
        latitude: latStr,
        longitude: lngStr,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className={`${styles.overlay} ${styles.itemOverlay}`} role="dialog" aria-modal="true">
      <div className={`${styles.modal} ${styles.itemModal}`}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>
            {mode === 'create' ? 'Add explore item' : 'Edit explore item'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={styles.modalClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="item-title">Title *</label>
            <input
              id="item-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              maxLength={200}
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="item-description">Description</label>
            <textarea
              id="item-description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="item-address">Address *</label>
            <input
              id="item-address"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              maxLength={300}
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="item-city">City *</label>
            <input
              id="item-city"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              maxLength={100}
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="item-state">State *</label>
            <input
              id="item-state"
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              maxLength={100}
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="item-country">Country</label>
            <input
              id="item-country"
              value={form.country}
              onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
              maxLength={100}
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="item-latitude">Latitude *</label>
            <input
              id="item-latitude"
              type="text"
              inputMode="decimal"
              value={form.latitude}
              onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
              placeholder="e.g. 40.7128"
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="item-longitude">Longitude *</label>
            <input
              id="item-longitude"
              type="text"
              inputMode="decimal"
              value={form.longitude}
              onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
              placeholder="e.g. -74.0060"
              required
            />
          </div>

          {error && <p className={styles.errorText}>{error}</p>}

          <div className={styles.formActions}>
            <button type="button" onClick={onClose} className={styles.btnSecondary}>
              Cancel
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={submitting}>
              {submitting ? 'Saving…' : mode === 'create' ? 'Add item' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
