'use client';

import { useRef, useState } from 'react';
import { uploadImage, type UploadPrefix } from '@/lib/upload-client';
import { IMAGE_UPLOAD_LIMITS_NOTE } from '@/lib/upload-rules';
import styles from './CoverImagesField.module.scss';

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';

export interface CoverImagesFieldProps {
  /** Image URLs in display order (first = main cover) */
  value: string[];
  onChange: (next: string[]) => void;
  label: React.ReactNode;
  required?: boolean;
  max: number;
  uploadPrefix?: UploadPrefix;
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function CoverImagesField({
  value,
  onChange,
  label,
  required = false,
  max,
  uploadPrefix = 'events',
}: CoverImagesFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const remaining = max - value.length;

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setUploadError(null);
    if (files.length > remaining) {
      setUploadError(`You can add ${remaining} more image${remaining === 1 ? '' : 's'} (max ${max}).`);
      return;
    }
    setUploadingCount(files.length);
    const results = await Promise.allSettled(files.map((file) => uploadImage(file, uploadPrefix)));
    setUploadingCount(0);
    const uploaded = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (uploaded.length > 0) onChange([...value, ...uploaded]);
    if (failed.length > 0) {
      const reason = failed[0].reason instanceof Error ? failed[0].reason.message : 'Upload failed';
      setUploadError(`${failed.length} of ${files.length} image${files.length === 1 ? '' : 's'} failed: ${reason}`);
    }
  }

  function handleDrop(target: number) {
    if (dragIndex !== null) onChange(move(value, dragIndex, target));
    setDragIndex(null);
    setDropIndex(null);
  }

  const uploading = uploadingCount > 0;

  return (
    <div className={styles.field}>
      <label className={styles.label}>
        {label}
        {required && <span className={styles.required}> *</span>}
      </label>
      <p className={styles.note}>
        {IMAGE_UPLOAD_LIMITS_NOTE} Up to {max} images. Drag to reorder, or use the arrows; image 1 is the main cover.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        onChange={handleFilesSelected}
        disabled={uploading}
        className={styles.fileInputHidden}
        aria-label="Upload cover images"
      />

      {value.length > 0 && (
        <ol className={styles.grid}>
          {value.map((url, idx) => (
            <li
              key={`${url}-${idx}`}
              className={`${styles.tile} ${dragIndex === idx ? styles.tileDragging : ''} ${
                dropIndex === idx && dragIndex !== idx ? styles.tileDropTarget : ''
              }`}
              draggable
              onDragStart={(e) => {
                setDragIndex(idx);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (dropIndex !== idx) setDropIndex(idx);
              }}
              onDragLeave={() => setDropIndex((cur) => (cur === idx ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(idx);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setDropIndex(null);
              }}
            >
              <span className={styles.badge}>{idx === 0 ? '1 · Main' : idx + 1}</span>
              {/* eslint-disable-next-line @next/next/no-img-element -- dynamic uploaded content */}
              <img src={url} alt={`Cover image ${idx + 1}`} className={styles.thumb} draggable={false} />
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => onChange(move(value, idx, idx - 1))}
                  disabled={idx === 0}
                  aria-label={`Move image ${idx + 1} left`}
                  title="Move left"
                >
                  ←
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => onChange(move(value, idx, idx + 1))}
                  disabled={idx === value.length - 1}
                  aria-label={`Move image ${idx + 1} right`}
                  title="Move right"
                >
                  →
                </button>
                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.removeBtn}`}
                  onClick={() => onChange(value.filter((_, i) => i !== idx))}
                  aria-label={`Remove image ${idx + 1}`}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {remaining > 0 && (
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading
            ? `Uploading ${uploadingCount} image${uploadingCount === 1 ? '' : 's'}…`
            : value.length === 0
              ? 'Choose images to upload'
              : `+ Add more images (${remaining} left)`}
        </button>
      )}
      {uploadError && <p className={styles.error}>{uploadError}</p>}
    </div>
  );
}
