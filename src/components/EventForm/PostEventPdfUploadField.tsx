'use client';

import { useRef, useState } from 'react';
import styles from '@/components/VenueForm/VenueForm.module.scss';
import { PDF_UPLOAD_LIMITS_NOTE } from '@/lib/upload-rules';
import { removePostEventPdfAction, uploadPostEventPdfAction } from '@/app/actions/event-post-event-pdf';
import { DEFAULT_POST_EVENT_REPORT_TITLE, PHASE_FLAG_OPTIONS, type PhaseFlags } from '@/lib/event-phase';

const ACCEPT = 'application/pdf';

export type PostEventReportSettings = PhaseFlags & { title: string };

export interface PostEventPdfUploadFieldProps {
  eventId: string;
  value: string;
  originalName?: string | null;
  uploadedAt?: string | null;
  onChange: (next: { url: string; originalName: string | null; uploadedAt: string | null }) => void;
  /** Title and phases shown in the mobile app; saved by the parent form. */
  settings?: PostEventReportSettings;
  onSettingsChange?: (next: PostEventReportSettings) => void;
}

export function PostEventPdfUploadField({
  eventId,
  value,
  originalName,
  uploadedAt,
  onChange,
  settings,
  onSettingsChange,
}: PostEventPdfUploadFieldProps) {
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
      const formData = new FormData();
      formData.append('file', file);
      const res = await uploadPostEventPdfAction(eventId, formData);
      if (!res.ok) throw new Error(res.error);
      onChange({ url: res.url, originalName: res.originalName, uploadedAt: res.uploadedAt });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setUploadError(null);
    setUploading(true);
    try {
      const res = await removePostEventPdfAction(eventId);
      if (!res.ok) throw new Error(res.error);
      onChange({ url: '', originalName: null, uploadedAt: null });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setUploading(false);
    }
  }

  const uploadedAtLabel = uploadedAt ? new Date(uploadedAt).toLocaleString() : null;
  const nameLabel = originalName?.trim() ? originalName.trim() : 'PDF';

  return (
    <div className={styles.imageUploadField}>
      <label className={styles.label}>Post-event report (PDF)</label>
      {settings && onSettingsChange && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <input
            type="text"
            maxLength={200}
            placeholder={`Report title (default: ${DEFAULT_POST_EVENT_REPORT_TITLE})`}
            value={settings.title}
            onChange={(e) => onSettingsChange({ ...settings, title: e.target.value })}
            className={styles.input}
            aria-label="Post-event report title"
          />
          <div
            role="group"
            aria-label="Show in mobile app during"
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem 1rem', fontSize: '0.875rem' }}
          >
            <span style={{ opacity: 0.8 }}>Show in app during *</span>
            {PHASE_FLAG_OPTIONS.map((opt) => (
              <label
                key={opt.flag}
                title={opt.hint}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={settings[opt.flag]}
                  onChange={(e) => onSettingsChange({ ...settings, [opt.flag]: e.target.checked })}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      )}
      <p className={styles.uploadLimitsNote}>{PDF_UPLOAD_LIMITS_NOTE}</p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleFileSelect}
        disabled={uploading}
        className={styles.fileInputHidden}
        aria-label="Upload post-event PDF"
      />

      {value?.trim() ? (
        <div className={styles.imageUploadWithPreview}>
          <div style={{ padding: '0.5rem 0', fontSize: '0.9rem' }}>
            <a href={value} target="_blank" rel="noopener noreferrer" className={styles.btnChange}>
              View / download: {nameLabel}
            </a>
            {uploadedAtLabel && <div style={{ marginTop: '0.25rem', opacity: 0.8 }}>Uploaded: {uploadedAtLabel}</div>}
          </div>
          <div className={styles.imageUploadActions}>
            <button
              type="button"
              className={styles.btnChange}
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Working…' : 'Replace PDF'}
            </button>
            <button type="button" className={styles.btnRemoveSmall} onClick={handleRemove} disabled={uploading}>
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
          {uploading ? 'Working…' : 'Upload post-event PDF'}
        </button>
      )}

      {uploadError && <p className={styles.uploadError}>{uploadError}</p>}
    </div>
  );
}

