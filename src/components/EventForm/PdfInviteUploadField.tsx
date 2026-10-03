'use client';

import { useRef, useState } from 'react';
import { uploadPdf, type UploadPrefix } from '@/lib/upload-client';
import { PDF_UPLOAD_LIMITS_NOTE } from '@/lib/upload-rules';
import styles from '@/components/VenueForm/VenueForm.module.scss';

const ACCEPT = 'application/pdf';

export interface PdfInviteUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
  label?: React.ReactNode;
  uploadPrefix?: UploadPrefix;
}

export function PdfInviteUploadField({
  value,
  onChange,
  label = 'E-invite (PDF)',
  uploadPrefix = 'events',
}: PdfInviteUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const url = await uploadPdf(file, uploadPrefix);
      onChange(url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleRemove() {
    onChange('');
  }

  return (
    <div className={styles.imageUploadField}>
      <label className={styles.label}>{label}</label>
      <p className={styles.uploadLimitsNote}>{PDF_UPLOAD_LIMITS_NOTE}</p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleFileSelect}
        disabled={uploading}
        className={styles.fileInputHidden}
        aria-label={typeof label === 'string' ? label : 'Upload PDF invitation'}
      />
      {value?.trim() ? (
        <div className={styles.imageUploadWithPreview}>
          <div style={{ padding: '0.5rem 0', fontSize: '0.9rem' }}>
            <a href={value} target="_blank" rel="noopener noreferrer" className={styles.btnChange}>
              View / download PDF
            </a>
          </div>
          <div className={styles.imageUploadActions}>
            <button
              type="button"
              className={styles.btnChange}
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : 'Replace PDF'}
            </button>
            <button type="button" className={styles.btnRemoveSmall} onClick={handleRemove}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={styles.btnUpload}
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? 'Uploading…' : 'Upload e-invite PDF'}
        </button>
      )}
      {uploadError && <p className={styles.uploadError}>{uploadError}</p>}
    </div>
  );
}
