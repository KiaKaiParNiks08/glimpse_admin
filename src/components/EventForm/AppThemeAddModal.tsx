'use client';

import { useEffect, useState } from 'react';
import { HexColorInput, HexColorPicker } from 'react-colorful';
import styles from './EventForm.module.scss';
import { createAppThemeAction } from '@/app/actions/events';
import type { AppThemeOption } from '@/app/actions/events';

type AppThemeAddModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (theme: AppThemeOption) => void;
};

type ColorBlockProps = {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  inputId: string;
};

/** In-page gradient + hue picker (no native OS color dialog — avoids eyedropper / z-index bugs). */
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

export function AppThemeAddModal({ open, onClose, onCreated }: AppThemeAddModalProps) {
  const [name, setName] = useState('');
  const [primary, setPrimary] = useState('#6366f1');
  const [secondary, setSecondary] = useState('#38bdf8');
  const [buttonPrimary, setButtonPrimary] = useState('#4338ca');
  const [buttonSecondary, setButtonSecondary] = useState('#0369a1');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setPrimary('#6366f1');
      setSecondary('#38bdf8');
      setButtonPrimary('#4338ca');
      setButtonSecondary('#0369a1');
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await createAppThemeAction({
        name: name.trim(),
        primary_color: primary,
        secondary_color: secondary,
        button_primary_color: buttonPrimary,
        button_secondary_color: buttonSecondary,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onCreated(res.data);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.addModalOverlay} role="presentation" onClick={onClose}>
      <div
        className={styles.addModalInner}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-theme-add-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="app-theme-add-title" className={styles.addModalTitle}>
          New app theme
        </h3>
        <p className={styles.addModalHint}>Name and four colors for app theme and buttons.</p>
        {error && <p className={styles.error}>{error}</p>}
        <form onSubmit={handleSubmit}>
          <div>
            <label className={styles.label} htmlFor="app-theme-name">
              Theme name
            </label>
            <input
              id="app-theme-name"
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ocean night"
              required
              maxLength={150}
            />
          </div>
          <div className={styles.colorRow}>
            <ColorBlock
              label="Primary"
              value={primary}
              onChange={setPrimary}
              inputId="app-theme-primary-hex"
            />
            <ColorBlock
              label="Secondary"
              value={secondary}
              onChange={setSecondary}
              inputId="app-theme-secondary-hex"
            />
            <ColorBlock
              label="Button Primary"
              value={buttonPrimary}
              onChange={setButtonPrimary}
              inputId="app-theme-button-primary-hex"
            />
            <ColorBlock
              label="Button Secondary"
              value={buttonSecondary}
              onChange={setButtonSecondary}
              inputId="app-theme-button-secondary-hex"
            />
          </div>
          <div className={styles.addModalActions}>
            <button type="button" className={styles.btnSecondary} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={loading}>
              {loading ? 'Saving…' : 'Save theme'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
