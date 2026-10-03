'use client';

import { useRef, useState } from 'react';
import { uploadImage, type UploadPrefix } from '@/lib/upload-client';
import { IMAGE_UPLOAD_LIMITS_NOTE } from '@/lib/upload-rules';
import styles from './VenueForm.module.scss';

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';

export interface ImageUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
  label: React.ReactNode;
  required?: boolean;
  /** Compact layout for use inside array items (e.g. contact/facility/photo rows) */
  compact?: boolean;
  /** S3 key prefix for uploads (e.g. 'venues', 'feed'). Default 'venues'. */
  uploadPrefix?: UploadPrefix;
  /** Extra check before upload; return an error message to reject the file. */
  validateFile?: (file: File) => Promise<string | null>;
  /** Replaces the default upload limits note. */
  note?: React.ReactNode;
}

export function ImageUploadField({
  value,
  onChange,
  label,
  required = false,
  compact = false,
  uploadPrefix = 'venues',
  validateFile,
  note,
}: ImageUploadFieldProps) {
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
      const invalid = validateFile ? await validateFile(file) : null;
      if (invalid) throw new Error(invalid);
      const url = await uploadImage(file, uploadPrefix);
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

  const previewUrl = value || null;

  if (compact) {
    return (
      <div className={styles.imageUploadCompact}>
        <label className={styles.label}>{label}</label>
        <p className={styles.uploadLimitsNote}>{note ?? IMAGE_UPLOAD_LIMITS_NOTE}</p>
        <div className={styles.imageUploadCompactRow}>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            onChange={handleFileSelect}
            disabled={uploading}
            className={styles.fileInputHidden}
            aria-label={typeof label === 'string' ? label : 'Upload image'}
          />
          {previewUrl ? (
            <>
              <div className={styles.imagePreviewSmall}>
                {/* eslint-disable-next-line @next/next/no-img-element -- preview URL is dynamic (upload); next/image requires known dimensions */}
                <img src={previewUrl} alt="" />
              </div>
              <div className={styles.imageUploadActions}>
                <button
                  type="button"
                  className={styles.btnChange}
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? 'Uploading…' : 'Change'}
                </button>
                <button type="button" className={styles.btnRemoveSmall} onClick={handleRemove}>
                  Remove
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className={styles.btnUpload}
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : 'Upload image'}
            </button>
          )}
          {uploadError && <span className={styles.uploadError}>{uploadError}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.imageUploadField}>
      <label className={styles.label}>
        {label}
        {required && <span className={styles.required}> *</span>}
      </label>
      <p className={styles.uploadLimitsNote}>{note ?? IMAGE_UPLOAD_LIMITS_NOTE}</p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleFileSelect}
        disabled={uploading}
        className={styles.fileInputHidden}
        aria-label={typeof label === 'string' ? label : 'Upload image'}
      />
      {previewUrl ? (
        <div className={styles.imageUploadWithPreview}>
          <div className={styles.imagePreview}>
            {/* eslint-disable-next-line @next/next/no-img-element -- preview URL is dynamic (upload); next/image requires known dimensions */}
            <img src={previewUrl} alt="" />
          </div>
          <div className={styles.imageUploadActions}>
            <button
              type="button"
              className={styles.btnChange}
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : 'Change image'}
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
          {uploading ? 'Uploading…' : 'Choose image to upload'}
        </button>
      )}
      {uploadError && <p className={styles.uploadError}>{uploadError}</p>}
    </div>
  );
}
