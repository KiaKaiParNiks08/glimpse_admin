'use client';

import { useEffect, useState } from 'react';
import { ImageUploadField } from '@/components/VenueForm/ImageUploadField';
import {
  type ExploreCategoryFormValues,
  type ExploreCategoryFormPayload,
  type ExploreCategoryFormCategory,
  emptyFormValues,
  categoryToFormValues,
  formValuesToPayload,
} from './types';
import styles from './ExploreCategoryForm.module.scss';

export interface ExploreCategoryFormProps {
  /** 'create' | 'edit' */
  mode: 'create' | 'edit';
  /** Prefill when editing */
  category?: ExploreCategoryFormCategory | null;
  onSubmit: (payload: ExploreCategoryFormPayload) => void | Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  error?: string | null;
}

export function ExploreCategoryForm({
  mode,
  category,
  onSubmit,
  onCancel,
  submitLabel,
  cancelLabel = 'Cancel',
  loading = false,
  error: externalError,
}: ExploreCategoryFormProps) {
  const [values, setValues] = useState<ExploreCategoryFormValues>(emptyFormValues());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (category) {
      setValues(categoryToFormValues(category));
    } else if (mode === 'create') {
      setValues(emptyFormValues());
    }
  }, [mode, category]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const title = values.title.trim();
    if (!title) {
      setError('Title is required');
      return;
    }
    if (!values.background_url.trim()) {
      setError('Background image is required (upload an image)');
      return;
    }
    try {
      await onSubmit(formValuesToPayload(values));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  const displayError = externalError ?? error;
  const defaultSubmitLabel = mode === 'create' ? 'Create category' : 'Save changes';

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.formGroup}>
        <label htmlFor="explore-cat-title">Title *</label>
        <input
          id="explore-cat-title"
          value={values.title}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          maxLength={150}
          required
        />
      </div>
      <div className={styles.formGroup}>
        <label htmlFor="explore-cat-description">Description</label>
        <textarea
          id="explore-cat-description"
          value={values.description}
          onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
          rows={3}
          maxLength={2000}
        />
      </div>
      <div className={styles.formGroup}>
        <ImageUploadField
          label="Background image *"
          value={values.background_url}
          onChange={(url) => setValues((v) => ({ ...v, background_url: url }))}
          required
          uploadPrefix="explore"
        />
      </div>

      {displayError && <p className={styles.errorText}>{displayError}</p>}

      <div className={styles.formActions}>
        {onCancel && (
          <button type="button" onClick={onCancel} className={styles.btnSecondary}>
            {cancelLabel}
          </button>
        )}
        <button type="submit" className={styles.btnPrimary} disabled={loading}>
          {loading ? 'Saving…' : submitLabel ?? defaultSubmitLabel}
        </button>
      </div>
    </form>
  );
}
