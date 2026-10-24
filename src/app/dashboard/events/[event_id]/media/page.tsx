'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import styles from './event-media.module.scss';
import {
  addSessionUploaderAction,
  createEventDayMediaAction,
  deleteEventDayMediaAction,
  deleteEventDayMediaBulkAction,
  getEventDaysForMediaAction,
  removeSessionUploaderAction,
  saveMediaPanelSessionAction,
  uploadSessionMediaFileAction,
} from '@/app/actions/event-day-media';
import {
  IMAGE_AND_VIDEO_UPLOAD_LIMITS_NOTE,
  precheckUploadFile,
} from '@/lib/upload-client';
import { WATERMARK_POSITION_LABELS, type EventWatermark } from '@/lib/watermark';
import { WatermarkOverlay } from '@/components/WatermarkOverlay';
import { ContentSkeleton } from '@/components/navigation/ContentSkeleton';

type DayMedia = {
  id: string;
  event_session_id: string | null;
  media_key?: string | null;
  media_url: string;
  media_type: string;
  thumbnail_url?: string | null;
  display_order: number | null;
};

type DaySession = {
  id: string;
  title: string;
  start_time: string | Date | null;
  end_time?: string | Date | null;
  media_panel_only?: boolean;
};

type EventDay = {
  id: string;
  date: string | Date;
  title: string | null;
  event_day_media: DayMedia[];
  event_sessions: DaySession[];
};

type EventDetails = {
  id: string;
  title: string;
  watermark: EventWatermark | null;
  is_corporate: boolean;
};

type SessionUploader = {
  id: string;
  event_id: string | null;
  event_session_id: string | null;
  all_sessions: boolean;
  mobile_number: string | null;
  country_code: string | null;
  email: string | null;
  session_title: string | null;
};

/** A gallery the admin can pick: one session, or the older day-wise uploads that have no session. */
type GalleryTarget = {
  key: string;
  dayId: string;
  sessionId: string | null;
  label: string;
  dayLabel: string;
  mediaPanelOnly: boolean;
};

function formatDayLabel(day: EventDay): string {
  const d = typeof day.date === 'string' ? new Date(day.date) : day.date;
  const dateLabel = d instanceof Date && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : String(day.date);
  const title = day.title?.trim() ? ` — ${day.title.trim()}` : '';
  return `${dateLabel}${title}`;
}

/** Session TIME values come back on the UTC epoch day, so read them with UTC getters. */
function sessionTimeHHmm(value: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
  }
  const match = value.match(/(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : null;
}

function buildGalleryTargets(days: EventDay[]): GalleryTarget[] {
  return days.flatMap((day) => {
    const dayLabel = formatDayLabel(day);
    const sessions = [...(day.event_sessions ?? [])].sort((a, b) =>
      (sessionTimeHHmm(a.start_time) ?? '99:99').localeCompare(sessionTimeHHmm(b.start_time) ?? '99:99')
    );
    const targets: GalleryTarget[] = sessions.map((s) => {
      const time = sessionTimeHHmm(s.start_time);
      return {
        key: s.id,
        dayId: day.id,
        sessionId: s.id,
        label: time ? `${s.title} (${time})` : s.title,
        dayLabel,
        mediaPanelOnly: s.media_panel_only === true,
      };
    });
    if ((day.event_day_media ?? []).some((m) => !m.event_session_id)) {
      targets.push({
        key: `day:${day.id}`,
        dayId: day.id,
        sessionId: null,
        label: 'Without session (older uploads)',
        dayLabel,
        mediaPanelOnly: false,
      });
    }
    return targets;
  });
}

export default function EventDayMediaPage({
  params,
}: {
  params: Promise<{ event_id: string }>;
}) {
  const { event_id: eventId } = use(params);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [days, setDays] = useState<EventDay[]>([]);
  const [uploaders, setUploaders] = useState<SessionUploader[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [uploaderDraft, setUploaderDraft] = useState('');
  const [uploadScope, setUploadScope] = useState<'all' | 'specific'>('specific');
  const [grantSessionIds, setGrantSessionIds] = useState<string[]>([]);
  const [sessionFormOpen, setSessionFormOpen] = useState(false);
  const [savingSession, setSavingSession] = useState(false);
  const [sessionForm, setSessionForm] = useState({
    id: '' as string,
    dayId: '',
    title: '',
    start_time: '',
    end_time: '',
  });
  const [savingUploader, setSavingUploader] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());

  const targets = useMemo(() => buildGalleryTargets(days), [days]);
  const targetGroups = useMemo(() => {
    const groups: { dayId: string; dayLabel: string; items: GalleryTarget[] }[] = [];
    for (const t of targets) {
      const last = groups[groups.length - 1];
      if (last && last.dayId === t.dayId) last.items.push(t);
      else groups.push({ dayId: t.dayId, dayLabel: t.dayLabel, items: [t] });
    }
    return groups;
  }, [targets]);
  const selectedTarget = targets.find((t) => t.key === selectedKey) ?? null;
  const selectedTargetLabel = selectedTarget ? `${selectedTarget.dayLabel} — ${selectedTarget.label}` : '';
  const selectedSessionId = selectedTarget?.sessionId ?? null;
  const sessionChoices = useMemo(
    () => targets.filter((target) => target.sessionId),
    [targets]
  );
  const dayMedia = useMemo(() => {
    if (!selectedTarget) return [];
    const day = days.find((d) => d.id === selectedTarget.dayId);
    return (day?.event_day_media ?? []).filter((m) => (m.event_session_id ?? null) === selectedTarget.sessionId);
  }, [days, selectedTarget]);
  const watermark = event?.watermark ?? null;
  const lightboxItem = lightboxIndex != null ? dayMedia[lightboxIndex] ?? null : null;
  const selectedCount = selectedMediaIds.size;
  const allSelected = dayMedia.length > 0 && selectedCount === dayMedia.length;

  function closeLightbox() {
    setLightboxIndex(null);
  }

  function showPrev() {
    setLightboxIndex((idx) => {
      if (idx == null) return idx;
      if (dayMedia.length === 0) return null;
      return (idx - 1 + dayMedia.length) % dayMedia.length;
    });
  }

  function showNext() {
    setLightboxIndex((idx) => {
      if (idx == null) return idx;
      if (dayMedia.length === 0) return null;
      return (idx + 1) % dayMedia.length;
    });
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getEventDaysForMediaAction(eventId);
      if (!res.ok) throw new Error(res.error);
      setEvent(res.event);
      setDays(res.days as unknown as EventDay[]);
      setUploaders(res.uploaders);
      setSelectedMediaIds(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!eventId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  useEffect(() => {
    if (selectedSessionId) {
      setGrantSessionIds((prev) => (prev.length === 0 ? [selectedSessionId] : prev));
    }
  }, [selectedSessionId]);

  useEffect(() => {
    if (targets.length > 0 && !targets.some((t) => t.key === selectedKey)) {
      setSelectedKey(targets[0]!.key);
    }
  }, [targets, selectedKey]);

  useEffect(() => {
    if (lightboxIndex == null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeLightbox();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        showPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        showNext();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIndex, dayMedia.length]);

  function toggleGrantSession(sessionId: string) {
    setGrantSessionIds((prev) => {
      const base = prev.length === 0 && selectedSessionId ? [selectedSessionId] : prev;
      return base.includes(sessionId) ? base.filter((id) => id !== sessionId) : [...base, sessionId];
    });
  }

  async function handleAddUploader() {
    const value = uploaderDraft.trim();
    if (!value) return;
    const sessionIds = uploadScope === 'specific' ? grantSessionIds : [];
    if (uploadScope === 'specific' && sessionIds.length === 0) {
      alert('Choose at least one session.');
      return;
    }
    setSavingUploader(true);
    setError(null);
    try {
      const isEmail = value.includes('@');
      const res = await addSessionUploaderAction({
        eventId,
        all_sessions: uploadScope === 'all',
        event_session_ids: sessionIds,
        email: isEmail ? value : undefined,
        mobile_number: isEmail ? undefined : value,
      });
      if (!res.ok) throw new Error(res.error);
      setUploaders(res.data);
      setUploaderDraft('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to add uploader');
    } finally {
      setSavingUploader(false);
    }
  }

  function openNewSessionForm() {
    setSessionForm({
      id: '',
      dayId: selectedTarget?.dayId || days[0]?.id || '',
      title: '',
      start_time: '',
      end_time: '',
    });
    setSessionFormOpen(true);
  }

  function openEditSessionForm() {
    const session = days
      .flatMap((day) => day.event_sessions.map((item) => ({ ...item, dayId: day.id })))
      .find((item) => item.id === selectedSessionId);
    if (!session?.media_panel_only) return;
    setSessionForm({
      id: session.id,
      dayId: session.dayId,
      title: session.title,
      start_time: sessionTimeHHmm(session.start_time) ?? '',
      end_time: sessionTimeHHmm(session.end_time ?? null) ?? '',
    });
    setSessionFormOpen(true);
  }

  async function handleSaveSession() {
    if (!sessionForm.dayId) {
      alert('Choose a day.');
      return;
    }
    setSavingSession(true);
    setError(null);
    try {
      const res = await saveMediaPanelSessionAction({
        eventId,
        sessionId: sessionForm.id || null,
        eventDayId: sessionForm.dayId,
        title: sessionForm.title,
        start_time: sessionForm.start_time,
        end_time: sessionForm.end_time,
      });
      if (!res.ok) throw new Error(res.error);
      setSessionFormOpen(false);
      setSelectedKey(res.sessionId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save session');
    } finally {
      setSavingSession(false);
    }
  }

  async function handleRemoveUploader(uploaderId: string) {
    setSavingUploader(true);
    setError(null);
    try {
      const res = await removeSessionUploaderAction({ eventId, uploaderId });
      if (!res.ok) throw new Error(res.error);
      setUploaders((prev) => prev.filter((row) => row.id !== uploaderId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to remove uploader');
    } finally {
      setSavingUploader(false);
    }
  }

  async function handleUpload() {
    if (!selectedSessionId) {
      alert('Select a session first.');
      return;
    }
    if (selectedFiles.length === 0) {
      alert('Choose one or more files to upload.');
      return;
    }

    setUploading(true);
    setError(null);
    const uploaded: Array<{ media_key: string; media_url: string; media_type: 'image' | 'video' }> = [];
    const failures: string[] = [];
    try {
      for (const file of selectedFiles) {
        try {
          const pre = await precheckUploadFile(file);
          if (!pre.ok) throw new Error(pre.error);

          const body = new FormData();
          body.append('file', file);
          body.append('event_id', eventId);
          body.append('event_session_id', selectedSessionId);
          if (pre.videoDurationSec != null) {
            body.append('video_duration_sec', String(pre.videoDurationSec));
          }
          const uploadedFile = await uploadSessionMediaFileAction(body);
          if (!uploadedFile.ok) throw new Error(uploadedFile.error);

          uploaded.push(uploadedFile.data);
        } catch (error) {
          failures.push(`${file.name}: ${error instanceof Error ? error.message : 'Upload failed'}`);
        }
      }

      let saved = false;
      if (uploaded.length > 0) {
        const createRes = await createEventDayMediaAction({
          eventId,
          eventSessionId: selectedSessionId,
          items: uploaded.map((item, index) => ({
            ...item,
            display_order: dayMedia.length + index,
          })),
        });
        if (!createRes.ok) failures.push(createRes.error);
        else saved = true;
      }

      if (saved) {
        setSelectedFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
      await load();
      if (failures.length > 0) setError(failures.join(' '));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(mediaId: string) {
    if (!confirm('Delete this media? This will remove it from S3 and the database.')) return;
    setDeletingId(mediaId);
    setError(null);
    try {
      const res = await deleteEventDayMediaAction({ eventId, mediaId });
      if (!res.ok) throw new Error(res.error);
      setSelectedMediaIds((prev) => {
        const next = new Set(prev);
        next.delete(mediaId);
        return next;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedMediaIds);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected item(s)? This will remove them from S3 and the database.`)) return;
    setBulkDeleting(true);
    setError(null);
    try {
      const res = await deleteEventDayMediaBulkAction({ eventId, mediaIds: ids });
      if (!res.ok) throw new Error(res.error);
      setSelectedMediaIds(new Set());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk delete failed');
    } finally {
      setBulkDeleting(false);
    }
  }

  if (loading) {
    return <ContentSkeleton variant="cards" />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.titleWrap}>
          <h1>Event session media</h1>
          <p>
            {event?.title ? (
              <>
                Manage session-wise images/videos for <strong>{event.title}</strong>. Add guest
                mobiles{event.is_corporate ? ' or emails' : ''} who may upload to a session from the
                app.
              </>
            ) : (
              'Manage session-wise images/videos.'
            )}
          </p>
        </div>
        <Link className={styles.backLink} href="/dashboard/events">
          ← Back to Events
        </Link>
      </div>

      {error && <p className={styles.errorText}>{error}</p>}

      <div className={styles.toolbar}>
        <select
          className={styles.select}
          value={selectedKey}
          onChange={(e) => {
            setSelectedKey(e.target.value);
            setSelectedMediaIds(new Set());
          }}
          aria-label="Session"
        >
          {targets.length === 0 ? (
            <option value="">No sessions yet</option>
          ) : (
            targetGroups.map((g) => (
              <optgroup key={g.dayId} label={g.dayLabel}>
                {g.items.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))
          )}
        </select>

        <button type="button" className={styles.btnPrimary} onClick={openNewSessionForm}>
          Add session
        </button>
        {selectedTarget?.mediaPanelOnly && (
          <button type="button" className={styles.btnSecondary} onClick={openEditSessionForm}>
            Edit session
          </button>
        )}
        <Link className={styles.btnSecondary} href={`/dashboard/events`}>
          Events
        </Link>
      </div>

      {sessionFormOpen && (
        <div className={styles.uploadCard}>
          <div style={{ color: '#0f172a', fontWeight: 600 }}>
            {sessionForm.id ? 'Edit session' : 'Add session'}
          </div>
          <div className={styles.hint}>
            This session belongs only to this event. It can be changed here and does not appear when you edit the event.
          </div>
          <div className={styles.uploadRow}>
            <select
              className={styles.select}
              value={sessionForm.dayId}
              onChange={(e) => setSessionForm((prev) => ({ ...prev, dayId: e.target.value }))}
              aria-label="Day"
            >
              {days.map((day) => (
                <option key={day.id} value={day.id}>
                  {formatDayLabel(day)}
                </option>
              ))}
            </select>
            <input
              className={styles.uploaderInput}
              value={sessionForm.title}
              onChange={(e) => setSessionForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Session title"
            />
            <input
              className={styles.uploaderInput}
              type="time"
              value={sessionForm.start_time}
              onChange={(e) => setSessionForm((prev) => ({ ...prev, start_time: e.target.value }))}
              aria-label="Start time"
            />
            <input
              className={styles.uploaderInput}
              type="time"
              value={sessionForm.end_time}
              onChange={(e) => setSessionForm((prev) => ({ ...prev, end_time: e.target.value }))}
              aria-label="End time"
            />
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => void handleSaveSession()}
              disabled={savingSession || !sessionForm.title.trim()}
            >
              {savingSession ? 'Saving…' : 'Save session'}
            </button>
            <button type="button" className={styles.btnSecondary} onClick={() => setSessionFormOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {sessionChoices.length > 0 && (
        <div className={styles.uploadCard}>
          <div>
            <div style={{ color: '#0f172a', fontWeight: 600 }}>Who can upload from the app</div>
            <div className={styles.hint}>
              {event?.is_corporate
                ? 'Add a work email or mobile, then choose every session or only specific ones.'
                : 'Add a mobile number, then choose every session or only specific ones.'}
            </div>
          </div>
          <div className={styles.uploadRow}>
            <input
              className={styles.uploaderInput}
              type="text"
              value={uploaderDraft}
              onChange={(e) => setUploaderDraft(e.target.value)}
              placeholder={event?.is_corporate ? 'Email or mobile number' : 'Mobile number'}
              disabled={savingUploader}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleAddUploader();
                }
              }}
            />
            <label className={styles.hint}>
              <input
                type="radio"
                name="upload-scope"
                checked={uploadScope === 'all'}
                onChange={() => setUploadScope('all')}
              />{' '}
              All sessions
            </label>
            <label className={styles.hint}>
              <input
                type="radio"
                name="upload-scope"
                checked={uploadScope === 'specific'}
                onChange={() => {
                  setUploadScope('specific');
                  if (grantSessionIds.length === 0 && selectedSessionId) {
                    setGrantSessionIds([selectedSessionId]);
                  }
                }}
              />{' '}
              Specific sessions
            </label>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => void handleAddUploader()}
              disabled={savingUploader || !uploaderDraft.trim()}
            >
              {savingUploader ? 'Saving…' : 'Add'}
            </button>
          </div>
          {uploadScope === 'specific' && (
            <div className={styles.chipRow}>
              {sessionChoices.map((target) => (
                <label key={target.key} className={styles.chip}>
                  <input
                    type="checkbox"
                    checked={grantSessionIds.includes(target.sessionId ?? '')}
                    onChange={() => target.sessionId && toggleGrantSession(target.sessionId)}
                  />{' '}
                  {target.dayLabel}: {target.label}
                </label>
              ))}
            </div>
          )}
          {uploaders.length > 0 ? (
            <div className={styles.chipRow}>
              {uploaders.map((row) => (
                <span key={row.id} className={styles.chip}>
                  {(row.email ||
                    [row.country_code, row.mobile_number].filter(Boolean).join(' ') ||
                    row.mobile_number) +
                    (row.all_sessions ? ' — All sessions' : ` — ${row.session_title ?? 'Session'}`)}
                  <button
                    type="button"
                    className={styles.chipRemove}
                    onClick={() => void handleRemoveUploader(row.id)}
                    disabled={savingUploader}
                    aria-label="Remove uploader"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div className={styles.hint}>No guests can upload yet.</div>
          )}
        </div>
      )}

      <div className={styles.uploadCard}>
        <div>
          <div style={{ color: '#e2e8f0', fontWeight: 600 }}>Upload media</div>
          <div className={styles.hint}>
            Supported: images and videos. Files are sent to the server, then saved on this session.{' '}
            {IMAGE_AND_VIDEO_UPLOAD_LIMITS_NOTE}
          </div>
          <div className={styles.hint}>
            {watermark
              ? `Watermark: ${WATERMARK_POSITION_LABELS[watermark.position]}, ${watermark.opacity}% opacity — shown on top of images (files are not changed).`
              : 'No watermark set. Add one in the event wizard, step "Gallery watermark".'}
          </div>
          {selectedTarget && !selectedSessionId && (
            <div className={styles.hint}>
              These were uploaded day-wise before sessions were used. New uploads go to a session.
            </div>
          )}
        </div>
        <div className={styles.uploadRow}>
          <input
            ref={fileInputRef}
            className={styles.fileInput}
            type="file"
            multiple
            accept="image/*,video/*"
            disabled={uploading || !selectedSessionId}
            onChange={async (e) => {
              const list = Array.from(e.target.files ?? []);
              e.target.value = '';
              setError(null);
              for (const file of list) {
                const pre = await precheckUploadFile(file);
                if (!pre.ok) {
                  setError(`${file.name}: ${pre.error}`);
                  setSelectedFiles([]);
                  return;
                }
              }
              setSelectedFiles(list);
            }}
          />
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={handleUpload}
            disabled={uploading || !selectedSessionId || selectedFiles.length === 0}
          >
            {uploading ? 'Uploading…' : `Upload (${selectedFiles.length || 0})`}
          </button>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => {
              setSelectedFiles([]);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            disabled={uploading || selectedFiles.length === 0}
          >
            Clear
          </button>
        </div>
      </div>

      <div>
        <div className={styles.galleryToolbar}>
          <div className={styles.galleryLeft}>
            <div style={{ color: '#e2e8f0', fontWeight: 600 }}>
              Gallery {selectedTarget ? <span style={{ color: '#94a3b8', fontWeight: 400 }}>({selectedTargetLabel})</span> : null}
            </div>
            <span className={styles.selectedCount}>
              Selected: {selectedCount}
            </span>
          </div>
          <div className={styles.galleryRight}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => {
                if (dayMedia.length === 0) return;
                setSelectedMediaIds((prev) => {
                  if (prev.size === dayMedia.length) return new Set();
                  return new Set(dayMedia.map((m) => m.id));
                });
              }}
              disabled={dayMedia.length === 0 || uploading || deletingId !== null || bulkDeleting}
            >
              {allSelected ? 'Clear selection' : 'Select all'}
            </button>
            <button
              type="button"
              className={styles.btnDanger}
              onClick={handleBulkDelete}
              disabled={selectedCount === 0 || uploading || deletingId !== null || bulkDeleting}
            >
              {bulkDeleting ? 'Deleting…' : `Delete selected (${selectedCount})`}
            </button>
            <button type="button" className={styles.btnSecondary} onClick={load} disabled={uploading || deletingId !== null || bulkDeleting}>
              Refresh
            </button>
          </div>
        </div>

        {dayMedia.length ? (
          <div className={styles.grid}>
            {dayMedia.map((m, idx) => (
              <div key={m.id} className={styles.card}>
                <input
                  type="checkbox"
                  className={styles.selectCheckbox}
                  checked={selectedMediaIds.has(m.id)}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSelectedMediaIds((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(m.id);
                      else next.delete(m.id);
                      return next;
                    });
                  }}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Select media"
                />
                <button
                  type="button"
                  className={styles.thumbButton}
                  onClick={() => setLightboxIndex(idx)}
                  aria-label={`Open ${m.media_type} preview`}
                >
                  {m.media_type === 'video' ? (
                    m.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- dynamic uploaded content
                      <img className={styles.thumb} src={m.thumbnail_url} alt="" />
                    ) : (
                      <video className={styles.thumb} src={m.media_url} preload="metadata" muted playsInline />
                    )
                  ) : (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- dynamic uploaded content */}
                      <img className={styles.thumb} src={m.media_url} alt="" />
                      {watermark && (
                        <WatermarkOverlay
                          url={watermark.url}
                          position={watermark.position}
                          opacity={watermark.opacity}
                          size={watermark.size}
                        />
                      )}
                    </>
                  )}
                </button>
                <div className={styles.actionsRow}>
                  <button
                    type="button"
                    className={styles.btnDanger}
                    onClick={() => handleDelete(m.id)}
                    disabled={deletingId === m.id || uploading || bulkDeleting}
                  >
                    {deletingId === m.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#94a3b8' }}>No media for this session yet.</p>
        )}
      </div>

      {lightboxItem && (
        <div
          className={styles.lightboxOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Media preview"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeLightbox();
          }}
        >
          <div className={styles.lightbox}>
            <div className={styles.lightboxTopbar}>
              <div className={styles.lightboxTitle}>
                {lightboxIndex != null ? lightboxIndex + 1 : 1} / {dayMedia.length}
                {selectedTarget ? ` — ${selectedTargetLabel}` : ''}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button type="button" className={styles.iconBtn} onClick={showPrev} disabled={dayMedia.length <= 1}>
                  Prev
                </button>
                <button type="button" className={styles.iconBtn} onClick={showNext} disabled={dayMedia.length <= 1}>
                  Next
                </button>
                <button type="button" className={styles.iconBtn} onClick={closeLightbox}>
                  Close
                </button>
              </div>
            </div>
            <div className={styles.lightboxBody}>
              <button type="button" className={styles.navBtn} onClick={showPrev} disabled={dayMedia.length <= 1} aria-label="Previous">
                ‹
              </button>
              <div className={styles.mediaStage}>
                {lightboxItem.media_type === 'video' ? (
                  <video className={styles.mediaFull} src={lightboxItem.media_url} controls autoPlay />
                ) : (
                  <div className={styles.watermarkBox}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- dynamic uploaded content */}
                    <img className={styles.mediaFull} src={lightboxItem.media_url} alt="" />
                    {watermark && (
                      <WatermarkOverlay
                        url={watermark.url}
                        position={watermark.position}
                        opacity={watermark.opacity}
                        size={watermark.size}
                      />
                    )}
                  </div>
                )}
              </div>
              <button type="button" className={styles.navBtn} onClick={showNext} disabled={dayMedia.length <= 1} aria-label="Next">
                ›
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

