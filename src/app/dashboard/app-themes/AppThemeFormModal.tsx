'use client';

import { useEffect, useState } from 'react';
import { HexColorInput, HexColorPicker } from 'react-colorful';
import {
  createAppThemeAdminAction,
  updateAppThemeAction,
  type AppThemeRow,
} from '@/app/actions/app-themes';
import { MobileThemePreview } from '@/components/theme/MobileThemePreview';
import styles from './app-themes.module.scss';

type AppThemeFormModalProps = {
  open: boolean;
  mode: 'create' | 'edit';
  row: AppThemeRow | null;
  onClose: () => void;
  onSuccess: () => void;
};

type ColorBlockProps = {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  inputId: string;
};

function ColorBlock({ label, value, onChange, inputId }: ColorBlockProps) {
  return (
    <div className={styles.colorBlock}>
      <span className={styles.colorBlockLabel}>{label}</span>
      <div className={styles.hexPickerWrap}>
        <HexColorPicker color={value} onChange={onChange} className={styles.hexColorPicker} />
        <label className={styles.hexCodeLabel} htmlFor={inputId}>
          Hex color code
        </label>
        <HexColorInput
          id={inputId}
          className={styles.hexCodeInput}
          color={value}
          onChange={onChange}
          prefixed
          spellCheck={false}
          autoComplete="off"
          aria-label={`${label} hex color code`}
        />
      </div>
    </div>
  );
}

export function AppThemeFormModal({ open, mode, row, onClose, onSuccess }: AppThemeFormModalProps) {
  const [name, setName] = useState('');
  const [primary, setPrimary] = useState('#6366f1');
  const [secondary, setSecondary] = useState('#38bdf8');
  const [buttonPrimary, setButtonPrimary] = useState('#4338ca');
  const [buttonSecondary, setButtonSecondary] = useState('#0369a1');
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [bodyTextColor, setBodyTextColor] = useState('#CBD5E1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === 'edit' && row) {
      setName(row.name);
      setPrimary(row.primary_color);
      setSecondary(row.secondary_color);
      setButtonPrimary(row.button_primary_color);
      setButtonSecondary(row.button_secondary_color);
      setTextColor(row.text_color ?? '#FFFFFF');
      setBodyTextColor(row.body_text_color ?? '#CBD5E1');
      return;
    }
    setName('');
    setPrimary('#6366f1');
    setSecondary('#38bdf8');
    setButtonPrimary('#4338ca');
    setButtonSecondary('#0369a1');
    setTextColor('#FFFFFF');
    setBodyTextColor('#CBD5E1');
  }, [open, mode, row]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        primary_color: primary,
        secondary_color: secondary,
        button_primary_color: buttonPrimary,
        button_secondary_color: buttonSecondary,
        text_color: textColor,
        body_text_color: bodyTextColor,
      };
      if (mode === 'create') {
        const result = await createAppThemeAdminAction(body);
        if (!result.ok) {
          setError(result.error);
          return;
        }
      } else if (row) {
        const result = await updateAppThemeAction(row.id, body);
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
        className={`${styles.modal} ${styles.modalWide}`}
        style={{ maxWidth: '64rem' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-theme-modal-title"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h2 id="app-theme-modal-title" className={styles.modalTitle}>
            {mode === 'create' ? 'New app theme' : 'Edit app theme'}
          </h2>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
          <form onSubmit={handleSubmit} className={styles.formStack}>
            <label className={styles.label}>
              Theme name
              <input
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={150}
                required
                placeholder="e.g. Ocean night"
              />
            </label>

            <div className={styles.colorRow}>
              <ColorBlock
                label="Primary (Screen Start)"
                value={primary}
                onChange={setPrimary}
                inputId="theme-primary-color"
              />
              <ColorBlock
                label="Secondary (Screen End)"
                value={secondary}
                onChange={setSecondary}
                inputId="theme-secondary-color"
              />
              <ColorBlock
                label="Button Primary"
                value={buttonPrimary}
                onChange={setButtonPrimary}
                inputId="theme-button-primary-color"
              />
              <ColorBlock
                label="Button Secondary"
                value={buttonSecondary}
                onChange={setButtonSecondary}
                inputId="theme-button-secondary-color"
              />
              <ColorBlock
                label="Title Text Color"
                value={textColor}
                onChange={setTextColor}
                inputId="theme-text-color"
              />
              <ColorBlock
                label="Body Text Color"
                value={bodyTextColor}
                onChange={setBodyTextColor}
                inputId="theme-body-text-color"
              />
            </div>

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

          <div>
            <MobileThemePreview
              primaryColor={primary}
              secondaryColor={secondary}
              buttonPrimaryColor={buttonPrimary}
              buttonSecondaryColor={buttonSecondary}
              textColor={textColor}
              bodyTextColor={bodyTextColor}
              hasThemeSelected={true}
              layout="single"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
