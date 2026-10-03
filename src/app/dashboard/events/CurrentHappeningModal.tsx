'use client';

import { useEffect, useMemo, useState } from 'react';
import { ImageUploadField } from '@/components/VenueForm/ImageUploadField';
import {
  IMAGE_AND_VIDEO_UPLOAD_LIMITS_NOTE,
  uploadFile,
  validateMediaFilesForUpload,
} from '@/lib/upload-client';
import {
  addHappeningPhotoAction,
  createCurrentHappeningAction,
  deleteCurrentHappeningAction,
  deleteHappeningPhotoAction,
  getCurrentHappeningAction,
  getCurrentHappeningSettingsAction,
  setCurrentHappeningSettingsAction,
  updateCurrentHappeningAction,
} from '@/app/actions/events';
import type { HappeningPhotoItemInput } from '@/lib/validations/events';
import {
  ALL_PHASES_ON,
  DEFAULT_CURRENT_HAPPENING_TITLE,
  PHASE_FLAG_OPTIONS,
  type PhaseFlags,
} from '@/lib/event-phase';
import styles from './events.module.scss';

function galleryFileMediaType(file: File): 'image' | 'video' {
  const t = (file.type || '').toLowerCase();
  return t.startsWith('video/') ? 'video' : 'image';
}

type CurrentHappeningModalProps = {
  open: boolean;
  eventId: string | null;
  eventTitle: string;
  onClose: () => void;
  onSuccess?: () => void;
};

export function CurrentHappeningModal({
  open,
  eventId,
  eventTitle,
  onClose,
  onSuccess,
}: CurrentHappeningModalProps) {
  const [items, setItems] = useState<
    Array<{
      id?: string;
      title: string;
      description: string;
      bg_image_url: string;
      happening_date: string;
      display_order: number;
      photos: Array<{
        id: string;
        image_url: string;
        media_type: 'image' | 'video';
        alt_text: string;
        sort_order: number;
      }>;
    }>
  >([]);
  const [sectionTitle, setSectionTitle] = useState('');
  const [sectionPhases, setSectionPhases] = useState<PhaseFlags>(ALL_PHASES_ON);
  const [editingIndexes, setEditingIndexes] = useState<Set<number>>(new Set());
  const [initialItemIds, setInitialItemIds] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{
    url: string;
    media_type: 'image' | 'video';
  } | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightbox(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  async function loadItems(targetEventId: string) {
    const res = await getCurrentHappeningAction(targetEventId);
    if (!res.ok) throw new Error(res.error ?? 'Unable to fetch current happening');
    setItems(
      res.data.map((h) => ({
        id: h.id,
        title: h.title,
        description: h.description ?? '',
        bg_image_url: h.bg_image_url,
        happening_date:
          h.happening_date instanceof Date
            ? h.happening_date.toISOString().slice(0, 10)
            : String(h.happening_date).slice(0, 10),
        display_order: h.display_order ?? 0,
        photos: (h.happening_photos ?? []).map((p) => ({
          id: p.id,
          image_url: p.image_url,
          media_type: p.media_type ?? 'image',
          alt_text: p.alt_text ?? '',
          sort_order: p.sort_order ?? 0,
        })),
      }))
    );
    setInitialItemIds(res.data.map((h) => h.id));
    setEditingIndexes(new Set());
  }

  async function loadSettings(targetEventId: string) {
    const res = await getCurrentHappeningSettingsAction(targetEventId);
    if (!res.ok) throw new Error(res.error ?? 'Unable to fetch current happening settings');
    setSectionTitle(res.data.title ?? '');
    setSectionPhases({
      show_pre_event: res.data.show_pre_event,
      show_ongoing_event: res.data.show_ongoing_event,
      show_post_event: res.data.show_post_event,
    });
  }

  useEffect(() => {
    if (!open || !eventId) return;
    setLoading(true);
    setError(null);
    Promise.all([loadItems(eventId), loadSettings(eventId)])
      .catch((e) => setError(e instanceof Error ? e.message : 'Unable to fetch current happening'))
      .finally(() => setLoading(false));
  }, [open, eventId]);

  const sortedIndexes = useMemo(
    () =>
      items
        .map((it, i) => ({ i, order: it.display_order ?? i }))
        .sort((a, b) => a.order - b.order)
        .map((x) => x.i),
    [items]
  );

  function toggleEdit(index: number) {
    setEditingIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function addNew() {
    setItems((prev) => [
      ...prev,
      {
        id: undefined,
        title: '',
        description: '',
        bg_image_url: '',
        happening_date: '',
        display_order: prev.length,
        photos: [],
      },
    ]);
    setEditingIndexes((prev) => {
      const next = new Set(prev);
      next.add(items.length);
      return next;
    });
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setEditingIndexes((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < index) next.add(i);
        if (i > index) next.add(i - 1);
      });
      return next;
    });
  }

  function openGallery(index: number) {
    setGalleryIndex(index);
    setSelectedPhotoIds(new Set());
    setError(null);
  }

  function closeGallery() {
    setGalleryIndex(null);
    setSelectedPhotoIds(new Set());
  }

  function openLightbox(photo: { image_url: string; media_type: 'image' | 'video' }) {
    setLightbox({ url: photo.image_url, media_type: photo.media_type });
  }

  async function handleSave() {
    if (!eventId) return;
    setError(null);
    const payload = items.map((h, i) => ({
      id: h.id,
      title: h.title.trim(),
      description: (h.description ?? '').trim(),
      bg_image_url: (h.bg_image_url ?? '').trim(),
      happening_date: (h.happening_date ?? '').trim(),
      display_order: h.display_order ?? i,
    }));
    const invalid = payload.find((h) => !h.title || !h.bg_image_url || !h.happening_date);
    if (invalid) {
      setError('Each current happening item must have title, date, and background image.');
      return;
    }
    if (!sectionPhases.show_pre_event && !sectionPhases.show_ongoing_event && !sectionPhases.show_post_event) {
      setError('Select at least one phase: pre-event, ongoing or post-event.');
      return;
    }

    setSaving(true);
    try {
      const settingsRes = await setCurrentHappeningSettingsAction(eventId, {
        title: sectionTitle.trim() || null,
        ...sectionPhases,
      });
      if (!settingsRes.ok) throw new Error(settingsRes.error);

      const existingIds = new Set(items.map((x) => x.id).filter(Boolean) as string[]);
      const initialIds = new Set(initialItemIds);

      for (const item of payload) {
        if (item.id) {
          const updated = await updateCurrentHappeningAction(eventId, item.id, item);
          if (!updated.ok) throw new Error(updated.error ?? 'Unable to update current happening');
        } else {
          const created = await createCurrentHappeningAction(eventId, item);
          if (!created.ok) throw new Error(created.error ?? 'Unable to create current happening');
        }
      }

      for (const id of initialIds) {
        if (!existingIds.has(id)) {
          const deleted = await deleteCurrentHappeningAction(eventId, id);
          if (!deleted.ok) throw new Error(deleted.error ?? 'Unable to delete current happening');
        }
      }

      await loadItems(eventId);
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save current happening');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  async function removePhoto(index: number, photoId: string) {
    if (!eventId) return;
    const res = await deleteHappeningPhotoAction(eventId, photoId);
    if (!res.ok) {
      setError(res.error ?? 'Unable to delete photo');
      return;
    }
    setItems((prev) =>
      prev.map((x, i) =>
        i === index ? { ...x, photos: x.photos.filter((p) => p.id !== photoId) } : x
      )
    );
  }

  async function handleMultiUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!eventId || galleryIndex == null) return;
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    const item = items[galleryIndex];
    if (!item?.id) {
      setError('Save the happening first, then upload photos or videos.');
      return;
    }

    setError(null);
    const batchCheck = await validateMediaFilesForUpload(files);
    if (!batchCheck.ok) {
      setError(batchCheck.error);
      return;
    }

    setGalleryBusy(true);
    try {
      const uploaded = await Promise.all(
        files.map(async (file, idx) => {
          const image_url = await uploadFile(
            file,
            'events/current-happening',
            batchCheck.prechecks[idx]
          );
          return { image_url, media_type: galleryFileMediaType(file) };
        })
      );
      const createdPhotos: Array<{
        id: string;
        image_url: string;
        media_type: 'image' | 'video';
        alt_text: string;
        sort_order: number;
      }> = [];
      let nextSort = item.photos.length;
      for (const { image_url, media_type } of uploaded) {
        const payload: HappeningPhotoItemInput = {
          image_url,
          media_type,
          alt_text: null,
          sort_order: nextSort++,
        };
        const created = await addHappeningPhotoAction(eventId, item.id, payload);
        if (!created.ok) {
          throw new Error(created.error);
        }
        if (!created.data) {
          throw new Error('Unable to add photo');
        }
        createdPhotos.push({
          id: created.data.id,
          image_url: created.data.image_url,
          media_type: created.data.media_type,
          alt_text: created.data.alt_text ?? '',
          sort_order: created.data.sort_order ?? 0,
        });
      }

      setItems((prev) =>
        prev.map((x, i) =>
          i === galleryIndex ? { ...x, photos: [...x.photos, ...createdPhotos] } : x
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload media');
    } finally {
      setGalleryBusy(false);
    }
  }

  async function handleDeleteSelectedPhotos() {
    if (!eventId || galleryIndex == null || selectedPhotoIds.size === 0) return;
    setGalleryBusy(true);
    setError(null);
    try {
      const ids = Array.from(selectedPhotoIds);
      for (const id of ids) {
        const res = await deleteHappeningPhotoAction(eventId, id);
        if (!res.ok) throw new Error(res.error ?? 'Unable to delete selected photos');
      }
      setItems((prev) =>
        prev.map((x, i) =>
          i === galleryIndex ? { ...x, photos: x.photos.filter((p) => !selectedPhotoIds.has(p.id)) } : x
        )
      );
      setSelectedPhotoIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete selected photos');
    } finally {
      setGalleryBusy(false);
    }
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.modal} style={{ maxWidth: '56rem' }}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>{sectionTitle.trim() || DEFAULT_CURRENT_HAPPENING_TITLE}</h2>
            <p className={styles.modalSubtitle}>{eventTitle}</p>
          </div>
          <button type="button" onClick={onClose} className={styles.modalClose} aria-label="Close">
            ×
          </button>
        </div>

        {error && <p className={styles.errorText}>{error}</p>}

        {loading ? (
          <p className={styles.wizardLoading}>Loading current happening…</p>
        ) : (
          <>
            <div className={styles.currentHappeningSettings}>
              <label className={styles.phaseChecksLabel} htmlFor="current-happening-section-title">
                Section title (shown in the mobile app)
              </label>
              <input
                id="current-happening-section-title"
                type="text"
                maxLength={150}
                placeholder={DEFAULT_CURRENT_HAPPENING_TITLE}
                value={sectionTitle}
                onChange={(e) => setSectionTitle(e.target.value)}
                className={styles.highlightInputFull}
              />
              <p className={styles.currentHappeningSettingsHint}>
                Leave empty to use “{DEFAULT_CURRENT_HAPPENING_TITLE}”. Each item below keeps its own title.
              </p>
              <div className={styles.phaseChecks} role="group" aria-label="Show in mobile app during">
                <span className={styles.phaseChecksLabel}>Show in app during *</span>
                {PHASE_FLAG_OPTIONS.map((opt) => (
                  <label key={opt.flag} className={styles.phaseCheckOption} title={opt.hint}>
                    <input
                      type="checkbox"
                      checked={sectionPhases[opt.flag]}
                      onChange={(e) =>
                        setSectionPhases((prev) => ({ ...prev, [opt.flag]: e.target.checked }))
                      }
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
            <div className={styles.highlightsList}>
              {items.length === 0 && (
                <div className={styles.adminEmpty}>No current happening items yet.</div>
              )}
              {sortedIndexes.map((idx) => {
                const item = items[idx];
                const isEditing = editingIndexes.has(idx);
                return (
                  <div key={idx} className={styles.highlightCard}>
                    <div className={styles.highlightRow}>
                      <div className={styles.currentHappeningCardRowMain}>
                        {item.bg_image_url ? (
                          <a
                            href={item.bg_image_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.currentHappeningBgThumbLink}
                            title="Open background image"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.bg_image_url}
                              alt=""
                              className={styles.currentHappeningBgThumb}
                            />
                          </a>
                        ) : (
                          <div className={styles.currentHappeningBgThumbPlaceholder} title="No background yet">
                            No bg
                          </div>
                        )}
                        <strong>{item.title || 'Untitled'}</strong>
                        <span className={styles.adminMeta}>
                          {item.happening_date || 'No date'}
                        </span>
                      </div>
                      <div className={styles.currentHappeningCardActions}>
                        <button
                          type="button"
                          onClick={() => openGallery(idx)}
                          className={styles.btnEdit}
                        >
                          Upload / view gallery ({item.photos.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleEdit(idx)}
                          className={styles.btnEdit}
                        >
                          {isEditing ? 'Done' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className={styles.btnDelete}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {isEditing && (
                      <>
                        <div className={styles.highlightRow}>
                          <input
                            type="text"
                            placeholder="Title *"
                            value={item.title}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x))
                              )
                            }
                            className={styles.highlightInput}
                          />
                          <input
                            type="date"
                            value={item.happening_date}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, happening_date: e.target.value } : x
                                )
                              )
                            }
                            className={styles.highlightInput}
                          />
                          <input
                            type="number"
                            min={0}
                            value={item.display_order ?? idx}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((x, i) =>
                                  i === idx
                                    ? {
                                        ...x,
                                        display_order:
                                          e.target.value === ''
                                            ? idx
                                            : parseInt(e.target.value, 10),
                                      }
                                    : x
                                )
                              )
                            }
                            className={styles.highlightOrder}
                          />
                        </div>
                        <textarea
                          placeholder="Description"
                          value={item.description ?? ''}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, description: e.target.value } : x
                              )
                            )
                          }
                          className={styles.highlightInputFull}
                          rows={2}
                        />
                        <div className={styles.highlightImageUpload}>
                          <ImageUploadField
                            label="Background image *"
                            value={item.bg_image_url}
                            onChange={(url) =>
                              setItems((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, bg_image_url: url } : x))
                              )
                            }
                            uploadPrefix="events/current-happening"
                            required
                          />
                        </div>

                        {item.id ? (
                          <div className={styles.currentHappeningInlineStrip}>
                            <span className={styles.currentHappeningInlineLabel}>
                              Gallery — upload photos or videos, click a thumbnail to view larger.{' '}
                              {IMAGE_AND_VIDEO_UPLOAD_LIMITS_NOTE}
                            </span>
                            <div className={styles.currentHappeningInlineScroll}>
                              {item.photos.map((photo) => (
                                <button
                                  key={photo.id}
                                  type="button"
                                  className={styles.currentHappeningInlineThumbBtn}
                                  onClick={() => openLightbox(photo)}
                                  title="View larger"
                                >
                                  {photo.media_type === 'video' ? (
                                    <video
                                      src={photo.image_url}
                                      muted
                                      playsInline
                                      preload="metadata"
                                      aria-hidden={true}
                                      tabIndex={-1}
                                    />
                                  ) : (
                                    /* eslint-disable-next-line @next/next/no-img-element */
                                    <img src={photo.image_url} alt="" />
                                  )}
                                </button>
                              ))}
                              <button
                                type="button"
                                className={styles.currentHappeningInlineManageBtn}
                                onClick={() => openGallery(idx)}
                              >
                                + Upload / manage gallery
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className={styles.currentHappeningInlineStrip}>
                            <p className={styles.currentHappeningInlineHint}>
                              Save this happening (title, date, background image) to upload gallery media.
                            </p>
                          </div>
                        )}

                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={addNew} className={styles.addHighlightBtn}>
              + Add new
            </button>
            <div className={styles.wizardActions}>
              <button type="button" onClick={onClose} className={styles.btnSecondary}>
                Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={saving} className={styles.btnPrimary}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>

      {galleryIndex != null && items[galleryIndex] && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.modal} style={{ maxWidth: '62rem' }}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Media gallery</h3>
                <p className={styles.modalSubtitle}>
                  {items[galleryIndex].title || 'Untitled happening'} —{' '}
                  {items[galleryIndex].photos.length} item
                  {items[galleryIndex].photos.length === 1 ? '' : 's'}.
                </p>
              </div>
              <button type="button" onClick={closeGallery} className={styles.modalClose} aria-label="Close gallery">
                ×
              </button>
            </div>

            {error && (
              <p className={styles.galleryErrorText} role="alert">
                {error}
              </p>
            )}

            <p className={styles.uploadLimitsNote}>{IMAGE_AND_VIDEO_UPLOAD_LIMITS_NOTE}</p>
            <div className={styles.currentHappeningGalleryToolbar}>
              <label className={styles.btnEdit}>
                Add files (photos or videos)
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
                  multiple
                  onChange={handleMultiUpload}
                  disabled={galleryBusy}
                  className={styles.fileInputHidden}
                />
              </label>
              <button
                type="button"
                className={styles.btnDelete}
                onClick={handleDeleteSelectedPhotos}
                disabled={galleryBusy || selectedPhotoIds.size === 0}
              >
                Delete selected ({selectedPhotoIds.size})
              </button>
            </div>

            {galleryBusy && <p className={styles.wizardLoading}>Processing media…</p>}

            <div className={styles.currentHappeningGalleryGrid}>
              {items[galleryIndex].photos.length === 0 ? (
                <div className={styles.adminEmpty}>No photos or videos uploaded yet.</div>
              ) : (
                items[galleryIndex].photos.map((photo) => (
                  <div key={photo.id} className={styles.currentHappeningGalleryItem}>
                    <div className={styles.currentHappeningGallerySelectRow}>
                      <input
                        type="checkbox"
                        checked={selectedPhotoIds.has(photo.id)}
                        onChange={(e) =>
                          setSelectedPhotoIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(photo.id);
                            else next.delete(photo.id);
                            return next;
                          })
                        }
                        aria-label={`Select ${photo.media_type} for bulk delete`}
                      />
                      <span>Select</span>
                    </div>
                    {photo.media_type === 'video' ? (
                      <>
                        <video
                          className={styles.currentHappeningGalleryGridVideo}
                          src={photo.image_url}
                          controls
                          playsInline
                          preload="metadata"
                          aria-label={photo.alt_text || 'Happening video'}
                        />
                        <button
                          type="button"
                          className={styles.currentHappeningGalleryLargerLink}
                          onClick={() => openLightbox(photo)}
                        >
                          Larger view
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className={styles.currentHappeningGalleryMediaBtn}
                        onClick={() => openLightbox(photo)}
                        title="View full size"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.image_url} alt={photo.alt_text || 'Happening photo'} />
                      </button>
                    )}
                    <div className={styles.currentHappeningGalleryActions}>
                      <a
                        href={photo.image_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.invitePdfLink}
                      >
                        Open in new tab
                      </a>
                      <button
                        type="button"
                        className={styles.btnDelete}
                        onClick={() => removePhoto(galleryIndex, photo.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div
          className={styles.currentHappeningLightbox}
          role="dialog"
          aria-modal="true"
          aria-label="Media preview"
        >
          <button
            type="button"
            className={styles.currentHappeningLightboxBackdrop}
            onClick={() => setLightbox(null)}
            aria-label="Close preview"
          />
          <button
            type="button"
            className={styles.currentHappeningLightboxClose}
            onClick={() => setLightbox(null)}
            aria-label="Close"
          >
            ×
          </button>
          <div className={styles.currentHappeningLightboxMedia}>
            {lightbox.media_type === 'video' ? (
              <video
                className={styles.currentHappeningLightboxVideo}
                src={lightbox.url}
                controls
                playsInline
                autoPlay
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={lightbox.url} alt="" className={styles.currentHappeningLightboxImg} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
