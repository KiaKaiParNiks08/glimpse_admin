'use client';

import { useEffect, useRef, useState } from 'react';
import styles from '@/components/VenueForm/VenueForm.module.scss';
import { PDF_UPLOAD_LIMITS_NOTE, IMAGE_UPLOAD_LIMITS_NOTE } from '@/lib/upload-rules';
import {
  removePostEventPdfAction,
  uploadPostEventPdfAction,
  uploadPostEventPdfThumbnailAction,
  removePostEventPdfThumbnailAction,
} from '@/app/actions/event-post-event-pdf';
import { DEFAULT_POST_EVENT_REPORT_TITLE, PHASE_FLAG_OPTIONS, type PhaseFlags } from '@/lib/event-phase';

const PDF_ACCEPT = 'application/pdf';
const IMAGE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';

export type PostEventReportSettings = PhaseFlags & { title: string };

export interface PostEventPdfUploadFieldProps {
  eventId: string;
  value: string;
  originalName?: string | null;
  uploadedAt?: string | null;
  thumbnailUrl?: string | null;
  onChange: (next: {
    url: string;
    originalName: string | null;
    uploadedAt: string | null;
    thumbnailUrl?: string | null;
  }) => void;
  /** Title and phases shown in the mobile app; saved by the parent form. */
  settings?: PostEventReportSettings;
  onSettingsChange?: (next: PostEventReportSettings) => void;
}

export function PostEventPdfUploadField({
  eventId,
  value,
  originalName,
  uploadedAt,
  thumbnailUrl,
  onChange,
  settings,
  onSettingsChange,
}: PostEventPdfUploadFieldProps) {
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);
  const [currentThumbnailUrl, setCurrentThumbnailUrl] = useState<string | null>(thumbnailUrl ?? null);

  useEffect(() => {
    setCurrentThumbnailUrl(thumbnailUrl ?? null);
  }, [thumbnailUrl]);

  async function handlePdfSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPdfError(null);
    setUploadingPdf(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await uploadPostEventPdfAction(eventId, formData);
      if (!res.ok) throw new Error(res.error);
      onChange({
        url: res.url,
        originalName: res.originalName,
        uploadedAt: res.uploadedAt,
        thumbnailUrl: currentThumbnailUrl,
      });
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingPdf(false);
    }
  }

  async function handleRemovePdf() {
    setPdfError(null);
    setUploadingPdf(true);
    try {
      const res = await removePostEventPdfAction(eventId);
      if (!res.ok) throw new Error(res.error);
      setCurrentThumbnailUrl(null);
      onChange({ url: '', originalName: null, uploadedAt: null, thumbnailUrl: null });
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setUploadingPdf(false);
    }
  }

  async function handleThumbnailSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setThumbnailError(null);
    setUploadingThumbnail(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await uploadPostEventPdfThumbnailAction(eventId, formData);
      if (!res.ok) throw new Error(res.error);
      setCurrentThumbnailUrl(res.url);
      onChange({
        url: value,
        originalName: originalName ?? null,
        uploadedAt: uploadedAt ?? null,
        thumbnailUrl: res.url,
      });
    } catch (err) {
      setThumbnailError(err instanceof Error ? err.message : 'Thumbnail upload failed');
    } finally {
      setUploadingThumbnail(false);
    }
  }

  async function handleRemoveThumbnail() {
    setThumbnailError(null);
    setUploadingThumbnail(true);
    try {
      const res = await removePostEventPdfThumbnailAction(eventId);
      if (!res.ok) throw new Error(res.error);
      setCurrentThumbnailUrl(null);
      onChange({
        url: value,
        originalName: originalName ?? null,
        uploadedAt: uploadedAt ?? null,
        thumbnailUrl: null,
      });
    } catch (err) {
      setThumbnailError(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setUploadingThumbnail(false);
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
        ref={pdfInputRef}
        type="file"
        accept={PDF_ACCEPT}
        onChange={handlePdfSelect}
        disabled={uploadingPdf}
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
              onClick={() => pdfInputRef.current?.click()}
              disabled={uploadingPdf}
            >
              {uploadingPdf ? 'Working…' : 'Replace PDF'}
            </button>
            <button type="button" className={styles.btnRemoveSmall} onClick={handleRemovePdf} disabled={uploadingPdf}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={styles.btnUpload}
          onClick={() => pdfInputRef.current?.click()}
          disabled={uploadingPdf}
        >
          {uploadingPdf ? 'Working…' : 'Upload post-event PDF'}
        </button>
      )}

      {pdfError && <p className={styles.uploadError}>{pdfError}</p>}

      {/* Thumbnail Image Section */}
      <div
        style={{
          marginTop: '1rem',
          paddingTop: '0.85rem',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        <label className={styles.label} style={{ fontSize: '0.9rem' }}>
          Report thumbnail image (optional)
        </label>
        <p className={styles.uploadLimitsNote}>{IMAGE_UPLOAD_LIMITS_NOTE}</p>

        <input
          ref={thumbnailInputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          onChange={handleThumbnailSelect}
          disabled={uploadingThumbnail}
          className={styles.fileInputHidden}
          aria-label="Upload report thumbnail image"
        />

        {currentThumbnailUrl?.trim() ? (
          <div className={styles.imageUploadWithPreview} style={{ alignItems: 'center' }}>
            <div className={styles.imagePreview} style={{ width: '120px', height: '80px', flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentThumbnailUrl}
                alt="Report thumbnail preview"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <div className={styles.imageUploadActions}>
              <button
                type="button"
                className={styles.btnChange}
                onClick={() => thumbnailInputRef.current?.click()}
                disabled={uploadingThumbnail}
              >
                {uploadingThumbnail ? 'Working…' : 'Change thumbnail'}
              </button>
              <button
                type="button"
                className={styles.btnRemoveSmall}
                onClick={handleRemoveThumbnail}
                disabled={uploadingThumbnail}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className={styles.btnUpload}
            onClick={() => thumbnailInputRef.current?.click()}
            disabled={uploadingThumbnail}
          >
            {uploadingThumbnail ? 'Working…' : 'Upload thumbnail image'}
          </button>
        )}

        {thumbnailError && <p className={styles.uploadError}>{thumbnailError}</p>}
      </div>
    </div>
  );
}
