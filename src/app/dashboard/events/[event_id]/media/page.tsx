'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import styles from './event-media.module.scss';
import {
  addSessionUploaderAction,
  deleteEventDayMediaAction,
  deleteEventDayMediaBulkAction,
  getEventDaysForMediaAction,
  removeSessionUploaderAction,
  saveMediaPanelSessionAction,
  type EventMediaPermissions,
} from '@/app/actions/event-day-media';
import { IMAGE_AND_VIDEO_UPLOAD_LIMITS_NOTE } from '@/lib/upload-client';
import {
  extractFilesFromDataTransfer,
  partitionMediaFiles,
  type ExcludedFileItem,
  type PreparedMediaCandidate,
} from '@/lib/media-upload-prep';
import { useDashboardUploads } from '@/components/upload/DashboardUploadProvider';
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

const DEFAULT_PERMS: EventMediaPermissions = {
  can_view: true,
  can_upload: false,
  can_delete: false,
  can_manage_sessions: false,
  can_manage_uploaders: false,
};

export default function EventDayMediaPage({
  params,
}: {
  params: Promise<{ event_id: string }>;
}) {
  const { event_id: eventId } = use(params);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const { jobs, enqueueSessionMediaUpload, subscribeToSessionCommits } = useDashboardUploads();

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [days, setDays] = useState<EventDay[]>([]);
  const [uploaders, setUploaders] = useState<SessionUploader[]>([]);
  const [permissions, setPermissions] = useState<EventMediaPermissions>(DEFAULT_PERMS);
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

  // Staged flattened individual media files (folders are never stored or displayed)
  const [stagedCandidates, setStagedCandidates] = useState<PreparedMediaCandidate[]>([]);
  const [excludedPrecheck, setExcludedPrecheck] = useState<ExcludedFileItem[]>([]);
  const [dragOver, setDragOver] = useState(false);

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

  const activeJobsForEvent = useMemo(
    () => jobs.filter((j) => j.eventId === eventId && j.status === 'running'),
    [jobs, eventId]
  );

  const attachFolderAttributes = useCallback((el: HTMLInputElement | null) => {
    folderInputRef.current = el;
    if (el) {
      el.setAttribute('webkitdirectory', '');
      el.setAttribute('directory', '');
    }
  }, []);

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

  const refreshQuietly = useCallback(async () => {
    if (!eventId) return;
    try {
      const res = await getEventDaysForMediaAction(eventId);
      if (!res.ok) return;
      setEvent(res.event);
      setDays(res.days as unknown as EventDay[]);
      setUploaders(res.uploaders);
      setPermissions(res.permissions);
    } catch {
      // ignore silent refresh errors
    }
  }, [eventId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getEventDaysForMediaAction(eventId);
      if (!res.ok) throw new Error(res.error);
      setEvent(res.event);
      setDays(res.days as unknown as EventDay[]);
      setUploaders(res.uploaders);
      setPermissions(res.permissions);
      setSelectedMediaIds(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!eventId) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  useEffect(() => {
    const unsub = subscribeToSessionCommits((commitEvent) => {
      if (commitEvent.eventId === eventId) {
        void refreshQuietly();
      }
    });
    return unsub;
  }, [eventId, refreshQuietly, subscribeToSessionCommits]);

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

  function handleIncomingFiles(rawFiles: File[]) {
    setError(null);
    const { accepted, excluded } = partitionMediaFiles(rawFiles);
    setStagedCandidates((prev) => {
      const next = [...prev];
      const existingSig = new Set(prev.map((c) => `${c.file.name}:${c.file.size}`));
      for (const candidate of accepted) {
        const sig = `${candidate.file.name}:${candidate.file.size}`;
        if (!existingSig.has(sig)) {
          existingSig.add(sig);
          next.push(candidate);
        }
      }
      return next;
    });
    setExcludedPrecheck((prev) => [...prev, ...excluded]);
  }

  function handleStartBackgroundUpload() {
    if (!selectedSessionId) {
      alert('Select a session first.');
      return;
    }
    if (stagedCandidates.length === 0 && excludedPrecheck.length === 0) {
      alert('Choose files or a folder containing images/videos.');
      return;
    }

    enqueueSessionMediaUpload({
      eventId,
      eventTitle: event?.title || 'Event',
      sessionId: selectedSessionId,
      sessionLabel: selectedTargetLabel || 'Session',
      startingOrder: dayMedia.length,
      candidates: stagedCandidates,
      preExcluded: excludedPrecheck,
    });

    setStagedCandidates([]);
    setExcludedPrecheck([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';
  }

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

  const imageCount = stagedCandidates.filter((c) => c.kind === 'image').length;
  const videoCount = stagedCandidates.filter((c) => c.kind === 'video').length;

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.titleWrap}>
          <h1>Event session media</h1>
          <p>
            {event?.title ? (
              <>
                Manage session-wise images/videos for <strong>{event.title}</strong>.
                {permissions.can_manage_uploaders
                  ? ` Add guest mobiles${event.is_corporate ? ' or emails' : ''} who may upload to a session from the app.`
                  : ''}
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

        {permissions.can_manage_sessions && (
          <>
            <button type="button" className={styles.btnPrimary} onClick={openNewSessionForm}>
              Add session
            </button>
            {selectedTarget?.mediaPanelOnly && (
              <button type="button" className={styles.btnSecondary} onClick={openEditSessionForm}>
                Edit session
              </button>
            )}
          </>
        )}
        <Link className={styles.btnSecondary} href="/dashboard/events">
          Events
        </Link>
      </div>

      {permissions.can_manage_sessions && sessionFormOpen && (
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

      {permissions.can_manage_uploaders && sessionChoices.length > 0 && (
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

      {permissions.can_upload && (
        <div className={styles.uploadCard}>
          <div>
            <div style={{ color: '#0f172a', fontWeight: 600 }}>Upload files or folder</div>
            <div className={styles.hint}>
              Select individual images/videos or an entire folder (nested folders are automatically
              flattened—only photos and videos are uploaded; unsupported files and 18+ content are
              excluded automatically). {IMAGE_AND_VIDEO_UPLOAD_LIMITS_NOTE}
            </div>
            <div className={styles.hint}>
              Uploads run concurrently in the background, so you can switch pages without interrupting them.
            </div>
            <div className={styles.hint}>
              {watermark
                ? `Watermark: ${WATERMARK_POSITION_LABELS[watermark.position]}, ${watermark.opacity}% opacity — shown on top of images (files are not changed).`
                : 'No watermark set. Add one in the event wizard, step "Gallery watermark".'}
            </div>
            {selectedTarget && !selectedSessionId && (
              <div className={styles.hint}>
                These were uploaded day-wise before sessions were used. Choose a session to upload new media.
              </div>
            )}
          </div>

          <div
            className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              if (!selectedSessionId) return;
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setDragOver(false);
              if (!selectedSessionId) return;
              const droppedFiles = await extractFilesFromDataTransfer(e.dataTransfer);
              handleIncomingFiles(droppedFiles);
            }}
          >
            <div className={styles.uploadRow}>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                hidden
                disabled={!selectedSessionId}
                onChange={(e) => {
                  const list = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  handleIncomingFiles(list);
                }}
              />
              <input
                ref={attachFolderAttributes}
                type="file"
                multiple
                hidden
                disabled={!selectedSessionId}
                onChange={(e) => {
                  const list = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  handleIncomingFiles(list);
                }}
              />

              <button
                type="button"
                className={styles.btnSecondary}
                disabled={!selectedSessionId}
                onClick={() => fileInputRef.current?.click()}
              >
                Choose Files
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                disabled={!selectedSessionId}
                onClick={() => folderInputRef.current?.click()}
              >
                Choose Folder
              </button>
              <span className={styles.hint}>or drag &amp; drop files / folders here</span>

              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleStartBackgroundUpload}
                disabled={!selectedSessionId || (stagedCandidates.length === 0 && excludedPrecheck.length === 0)}
                style={{ marginLeft: 'auto' }}
              >
                {stagedCandidates.length > 0
                  ? `Start Upload (${stagedCandidates.length})`
                  : 'Start Upload'}
              </button>
              {(stagedCandidates.length > 0 || excludedPrecheck.length > 0) && (
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => {
                    setStagedCandidates([]);
                    setExcludedPrecheck([]);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                    if (folderInputRef.current) folderInputRef.current.value = '';
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {stagedCandidates.length > 0 && (
              <>
                <div className={styles.hint}>
                  Ready to upload: <strong>{imageCount}</strong> image(s), <strong>{videoCount}</strong> video(s)
                  {' '}(18+ safety scan runs before saving).
                </div>
                <div className={styles.queuePreviewList}>
                  {stagedCandidates.slice(0, 30).map((c, idx) => (
                    <span key={`${c.file.name}-${idx}`} className={styles.queuePreviewChip}>
                      {c.kind === 'video' ? '🎬' : '🖼️'} {c.file.name}
                    </span>
                  ))}
                  {stagedCandidates.length > 30 && (
                    <span className={styles.queuePreviewChip}>
                      +{stagedCandidates.length - 30} more item(s)
                    </span>
                  )}
                </div>
              </>
            )}

            {excludedPrecheck.length > 0 && (
              <div className={styles.excludedBanner}>
                <strong>
                  Excluded {excludedPrecheck.length} non-media / oversized file(s) — only valid images &amp; videos proceed:
                </strong>
                <div>
                  {excludedPrecheck
                    .slice(0, 6)
                    .map((item) => `${item.name} (${item.reason})`)
                    .join('; ')}
                  {excludedPrecheck.length > 6 ? ` (+${excludedPrecheck.length - 6} more)` : ''}
                </div>
              </div>
            )}

            {activeJobsForEvent.length > 0 && (
              <div className={styles.hint} style={{ color: '#1b4372', fontWeight: 600 }}>
                Background upload active ({activeJobsForEvent[0]!.processedCount}/
                {activeJobsForEvent[0]!.totalFiles} checked · {activeJobsForEvent[0]!.uploadedCount} saved) —
                gallery updates automatically as batches finish.
              </div>
            )}
          </div>
        </div>
      )}

      <div>
        <div className={styles.galleryToolbar}>
          <div className={styles.galleryLeft}>
            <div style={{ color: '#0f172a', fontWeight: 600 }}>
              Gallery{' '}
              {selectedTarget ? (
                <span style={{ color: '#64748b', fontWeight: 400 }}>({selectedTargetLabel})</span>
              ) : null}
            </div>
            {permissions.can_delete && (
              <span className={styles.selectedCount}>Selected: {selectedCount}</span>
            )}
          </div>
          <div className={styles.galleryRight}>
            {permissions.can_delete && (
              <>
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
                  disabled={dayMedia.length === 0 || deletingId !== null || bulkDeleting}
                >
                  {allSelected ? 'Clear selection' : 'Select all'}
                </button>
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={handleBulkDelete}
                  disabled={selectedCount === 0 || deletingId !== null || bulkDeleting}
                >
                  {bulkDeleting ? 'Deleting…' : `Delete selected (${selectedCount})`}
                </button>
              </>
            )}
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={load}
              disabled={deletingId !== null || bulkDeleting}
            >
              Refresh
            </button>
          </div>
        </div>

        {dayMedia.length ? (
          <div className={styles.grid}>
            {dayMedia.map((m, idx) => (
              <div key={m.id} className={styles.card}>
                {permissions.can_delete && (
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
                )}
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
                {permissions.can_delete && (
                  <div className={styles.actionsRow}>
                    <button
                      type="button"
                      className={styles.btnDanger}
                      onClick={() => handleDelete(m.id)}
                      disabled={deletingId === m.id || bulkDeleting}
                    >
                      {deletingId === m.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#64748b' }}>No media for this session yet.</p>
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
