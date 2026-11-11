'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { adminBearerAuthHeader } from '@/lib/admin-jwt-client';
import {
  createEventDayMediaAction,
  notifySessionMediaBatchAction,
  presignEventDayMediaUploadAction,
  uploadSessionMediaFileAction,
} from '@/app/actions/event-day-media';
import { MAX_VIDEO_DURATION_SECONDS } from '@/lib/upload-rules';
import {
  inspectMediaForModerationAndMeta,
  type ExcludedFileItem,
  type PreparedMediaCandidate,
} from '@/lib/media-upload-prep';

export type UploadJobStatus = 'running' | 'completed' | 'completed_with_issues' | 'cancelled';

export type UploadJobSummary = {
  id: string;
  eventId: string;
  eventTitle: string;
  sessionId: string;
  sessionLabel: string;
  totalFiles: number;
  processedCount: number;
  uploadedCount: number;
  blockedCount: number;
  failedCount: number;
  activeFiles: string[];
  excludedItems: ExcludedFileItem[];
  failedItems: ExcludedFileItem[];
  status: UploadJobStatus;
  createdAt: number;
};

export type EnqueueSessionMediaInput = {
  eventId: string;
  eventTitle: string;
  sessionId: string;
  sessionLabel: string;
  startingOrder: number;
  candidates: PreparedMediaCandidate[];
  preExcluded?: ExcludedFileItem[];
};

export type SessionCommitEvent = {
  eventId: string;
  sessionId: string;
  committedCount: number;
};

type DashboardUploadContextValue = {
  jobs: UploadJobSummary[];
  hasActiveUploads: boolean;
  enqueueSessionMediaUpload: (input: EnqueueSessionMediaInput) => string;
  cancelJob: (jobId: string) => void;
  dismissJob: (jobId: string) => void;
  clearCompletedJobs: () => void;
  subscribeToSessionCommits: (listener: (event: SessionCommitEvent) => void) => () => void;
};

const DashboardUploadContext = createContext<DashboardUploadContextValue>({
  jobs: [],
  hasActiveUploads: false,
  enqueueSessionMediaUpload: () => '',
  cancelJob: () => {},
  dismissJob: () => {},
  clearCompletedJobs: () => {},
  subscribeToSessionCommits: () => () => {},
});

const UPLOAD_CONCURRENCY = 6;
const COMMIT_BATCH_SIZE = 15;
const PRESIGN_BATCH_SIZE = 20;
const SERVER_FALLBACK_MAX_BYTES = 4.2 * 1024 * 1024;

type SignedTarget = { uploadUrl: string; fileUrl: string; key: string };

async function batchPresignCandidates(params: {
  eventId: string;
  sessionId: string;
  candidates: Array<{ idx: number; filename: string; contentType: string; fileSize: number }>;
}): Promise<Map<number, SignedTarget>> {
  const map = new Map<number, SignedTarget>();
  if (params.candidates.length === 0) return map;
  try {
    const res = await fetch(
      `/api/admin/events/${params.eventId}/sessions/${params.sessionId}/presign-batch`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...adminBearerAuthHeader(),
        },
        body: JSON.stringify({
          files: params.candidates.map((c) => ({
            filename: c.filename,
            contentType: c.contentType,
            fileSize: c.fileSize,
          })),
        }),
      }
    );
    if (!res.ok) return map;
    const json = (await res.json()) as {
      data?: { items?: Array<{ ok?: boolean; uploadUrl?: string; fileUrl?: string; key?: string }> };
      items?: Array<{ ok?: boolean; uploadUrl?: string; fileUrl?: string; key?: string }>;
    };
    const items = json.data?.items ?? json.items ?? [];
    items.forEach((entry, pos) => {
      if (entry?.ok && entry.uploadUrl && entry.fileUrl && entry.key) {
        map.set(params.candidates[pos]!.idx, {
          uploadUrl: entry.uploadUrl,
          fileUrl: entry.fileUrl,
          key: entry.key,
        });
      }
    });
  } catch {
    // Graceful fallback to individual presign / server action below
  }
  return map;
}

type ModerationApiResult = {
  allowed: boolean;
  reason: string | null;
};

async function runClientModerationCheck(
  eventId: string,
  frames: Blob[]
): Promise<ModerationApiResult> {
  if (frames.length === 0) {
    return { allowed: true, reason: null };
  }
  try {
    const body = new FormData();
    frames.forEach((frame, idx) => {
      body.append('frames', frame, `frame-${idx}.jpg`);
    });
    const res = await fetch(`/api/admin/events/${eventId}/moderation-check`, {
      method: 'POST',
      headers: adminBearerAuthHeader(),
      body,
    });
    if (!res.ok) {
      // Fail open only on transient auth/network errors to avoid stalling valid media batches.
      return { allowed: true, reason: null };
    }
    const json = (await res.json()) as {
      data?: { allowed?: boolean; reason?: string | null };
      allowed?: boolean;
      reason?: string | null;
    };
    const payload = json.data ?? json;
    if (payload.allowed === false) {
      return {
        allowed: false,
        reason: payload.reason || 'Restricted 18+ content detected',
      };
    }
    return { allowed: true, reason: null };
  } catch {
    return { allowed: true, reason: null };
  }
}

async function uploadCandidateMedia(params: {
  eventId: string;
  sessionId: string;
  candidate: PreparedMediaCandidate;
  videoDurationSec?: number;
  preSigned?: SignedTarget | null;
}): Promise<{ media_key: string; media_url: string; media_type: 'image' | 'video' }> {
  const { eventId, sessionId, candidate, videoDurationSec, preSigned } = params;
  const { file, kind, mimeType } = candidate;

  const presignData =
    preSigned ??
    (await presignEventDayMediaUploadAction({
      eventId,
      eventSessionId: sessionId,
      filename: file.name,
      contentType: mimeType,
      fileSize: file.size,
      videoDurationSec,
    }).then((r) => (r.ok ? r.data : null)));

  if (presignData && /^https?:\/\//i.test(presignData.uploadUrl)) {
    try {
      const putRes = await fetch(presignData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: file,
      });
      if (putRes.ok) {
        return {
          media_key: presignData.key,
          media_url: presignData.fileUrl,
          media_type: kind,
        };
      }
    } catch {
      // Fall through to server-action fallback if browser direct PUT to S3 is blocked by CORS.
    }
  }

  if (file.size > SERVER_FALLBACK_MAX_BYTES) {
    throw new Error(
      'Direct S3 upload could not reach storage and file exceeds 4.2 MB server fallback limit.'
    );
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('event_id', eventId);
  formData.append('event_session_id', sessionId);
  if (videoDurationSec != null) {
    formData.append('video_duration_sec', String(videoDurationSec));
  }
  const uploaded = await uploadSessionMediaFileAction(formData);
  if (!uploaded.ok) {
    throw new Error(uploaded.error || 'Upload failed');
  }
  return uploaded.data;
}

export function DashboardUploadProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<UploadJobSummary[]>([]);
  const cancelledJobsRef = useRef<Set<string>>(new Set());
  const commitListenersRef = useRef<Set<(event: SessionCommitEvent) => void>>(new Set());

  const hasActiveUploads = useMemo(
    () => jobs.some((job) => job.status === 'running'),
    [jobs]
  );

  useEffect(() => {
    if (!hasActiveUploads) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasActiveUploads]);

  const notifyCommitListeners = useCallback((event: SessionCommitEvent) => {
    for (const listener of commitListenersRef.current) {
      try {
        listener(event);
      } catch {
        // Isolate subscriber errors
      }
    }
  }, []);

  const subscribeToSessionCommits = useCallback(
    (listener: (event: SessionCommitEvent) => void) => {
      commitListenersRef.current.add(listener);
      return () => {
        commitListenersRef.current.delete(listener);
      };
    },
    []
  );

  const patchJob = useCallback(
    (jobId: string, updater: (prev: UploadJobSummary) => UploadJobSummary) => {
      setJobs((prev) => prev.map((j) => (j.id === jobId ? updater(j) : j)));
    },
    []
  );

  const processJob = useCallback(
    async (jobId: string, input: EnqueueSessionMediaInput) => {
      const candidates = input.candidates;
      if (candidates.length === 0) {
        patchJob(jobId, (prev) => ({
          ...prev,
          status:
            prev.excludedItems.length > 0 ? 'completed_with_issues' : 'completed',
        }));
        return;
      }

      let cursor = 0;
      let totalCommittedInJob = 0;
      const presignMap = new Map<number, SignedTarget>();
      const presignFlights = new Map<number, Promise<void>>();
      const pendingDbBatch: Array<{
        media_key: string;
        media_url: string;
        media_type: 'image' | 'video';
        display_order: number;
      }> = [];
      let flushing = false;
      let orderCounter = input.startingOrder;

      async function getPreSignedForIndex(idx: number): Promise<SignedTarget | null> {
        const hit = presignMap.get(idx);
        if (hit) return hit;
        const candidate = candidates[idx];
        if (!candidate || candidate.kind === 'video') return null;

        const blockStart = Math.floor(idx / PRESIGN_BATCH_SIZE) * PRESIGN_BATCH_SIZE;
        let flight = presignFlights.get(blockStart);
        if (!flight) {
          const blockItems: Array<{ idx: number; filename: string; contentType: string; fileSize: number }> = [];
          const end = Math.min(candidates.length, blockStart + PRESIGN_BATCH_SIZE);
          for (let j = blockStart; j < end; j++) {
            const c = candidates[j]!;
            if (c.kind === 'image') {
              blockItems.push({
                idx: j,
                filename: c.file.name,
                contentType: c.mimeType,
                fileSize: c.file.size,
              });
            }
          }
          flight = batchPresignCandidates({
            eventId: input.eventId,
            sessionId: input.sessionId,
            candidates: blockItems,
          }).then((resMap) => {
            for (const [k, v] of resMap.entries()) presignMap.set(k, v);
          });
          presignFlights.set(blockStart, flight);
        }
        await flight;
        return presignMap.get(idx) ?? null;
      }

      async function flushBatch(force = false) {
        if (flushing && !force) return;
        if (pendingDbBatch.length === 0) return;
        flushing = true;
        try {
          while (pendingDbBatch.length > 0) {
            if (!force && pendingDbBatch.length < COMMIT_BATCH_SIZE) break;
            const slice = pendingDbBatch.splice(0, COMMIT_BATCH_SIZE);
            const res = await createEventDayMediaAction({
              eventId: input.eventId,
              eventSessionId: input.sessionId,
              skipNotification: true,
              items: slice,
            });
            if (res.ok) {
              totalCommittedInJob += slice.length;
              patchJob(jobId, (prev) => ({
                ...prev,
                uploadedCount: prev.uploadedCount + slice.length,
              }));
              notifyCommitListeners({
                eventId: input.eventId,
                sessionId: input.sessionId,
                committedCount: slice.length,
              });
            } else {
              patchJob(jobId, (prev) => ({
                ...prev,
                failedCount: prev.failedCount + slice.length,
                failedItems: [
                  ...prev.failedItems,
                  { name: `${slice.length} media item(s)`, reason: res.error },
                ],
              }));
            }
          }
        } finally {
          flushing = false;
        }
      }

      async function worker() {
        while (true) {
          if (cancelledJobsRef.current.has(jobId)) return;
          const idx = cursor;
          cursor += 1;
          if (idx >= candidates.length) return;
          const candidate = candidates[idx]!;
          const labelName = candidate.file.name;

          patchJob(jobId, (prev) => ({
            ...prev,
            activeFiles: Array.from(new Set([...prev.activeFiles, labelName])).slice(0, 6),
          }));

          try {
            const meta = await inspectMediaForModerationAndMeta(candidate.file, candidate.kind);
            if (cancelledJobsRef.current.has(jobId)) return;

            if (
              candidate.kind === 'video' &&
              meta.durationSec != null &&
              meta.durationSec > MAX_VIDEO_DURATION_SECONDS
            ) {
              patchJob(jobId, (prev) => ({
                ...prev,
                processedCount: prev.processedCount + 1,
                blockedCount: prev.blockedCount + 1,
                excludedItems: [
                  ...prev.excludedItems,
                  {
                    name: labelName,
                    reason: `Video length (${meta.durationSec}s) exceeds ${MAX_VIDEO_DURATION_SECONDS}s limit`,
                  },
                ],
              }));
              continue;
            }

            const [moderation, preSigned] = await Promise.all([
              runClientModerationCheck(input.eventId, meta.frames),
              getPreSignedForIndex(idx),
            ]);
            if (cancelledJobsRef.current.has(jobId)) return;
            if (!moderation.allowed) {
              patchJob(jobId, (prev) => ({
                ...prev,
                processedCount: prev.processedCount + 1,
                blockedCount: prev.blockedCount + 1,
                excludedItems: [
                  ...prev.excludedItems,
                  {
                    name: labelName,
                    reason: moderation.reason || 'Restricted 18+ content detected',
                  },
                ],
              }));
              continue;
            }

            const stored = await uploadCandidateMedia({
              eventId: input.eventId,
              sessionId: input.sessionId,
              candidate,
              videoDurationSec: meta.durationSec,
              preSigned,
            });
            if (cancelledJobsRef.current.has(jobId)) return;

            const displayOrder = orderCounter;
            orderCounter += 1;
            pendingDbBatch.push({ ...stored, display_order: displayOrder });

            patchJob(jobId, (prev) => ({
              ...prev,
              processedCount: prev.processedCount + 1,
            }));

            if (pendingDbBatch.length >= COMMIT_BATCH_SIZE) {
              await flushBatch(false);
            }
          } catch (err) {
            patchJob(jobId, (prev) => ({
              ...prev,
              processedCount: prev.processedCount + 1,
              failedCount: prev.failedCount + 1,
              failedItems: [
                ...prev.failedItems,
                {
                  name: labelName,
                  reason: err instanceof Error ? err.message : 'Upload failed',
                },
              ],
            }));
          } finally {
            patchJob(jobId, (prev) => ({
              ...prev,
              activeFiles: prev.activeFiles.filter((n) => n !== labelName),
            }));
          }
        }
      }

      const workerCount = Math.min(UPLOAD_CONCURRENCY, candidates.length);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));
      await flushBatch(true);

      if (totalCommittedInJob > 0) {
        void notifySessionMediaBatchAction({
          eventId: input.eventId,
          eventSessionId: input.sessionId,
          count: totalCommittedInJob,
        });
      }

      const wasCancelled = cancelledJobsRef.current.has(jobId);
      patchJob(jobId, (prev) => {
        if (wasCancelled) {
          return { ...prev, activeFiles: [], status: 'cancelled' };
        }
        const hasIssues = prev.blockedCount > 0 || prev.failedCount > 0 || prev.excludedItems.length > 0;
        return {
          ...prev,
          activeFiles: [],
          status: hasIssues ? 'completed_with_issues' : 'completed',
        };
      });
    },
    [notifyCommitListeners, patchJob]
  );

  const enqueueSessionMediaUpload = useCallback(
    (input: EnqueueSessionMediaInput) => {
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const preExcluded = input.preExcluded ?? [];
      const job: UploadJobSummary = {
        id,
        eventId: input.eventId,
        eventTitle: input.eventTitle,
        sessionId: input.sessionId,
        sessionLabel: input.sessionLabel,
        totalFiles: input.candidates.length,
        processedCount: 0,
        uploadedCount: 0,
        blockedCount: preExcluded.length,
        failedCount: 0,
        activeFiles: [],
        excludedItems: [...preExcluded],
        failedItems: [],
        status: input.candidates.length > 0 ? 'running' : 'completed_with_issues',
        createdAt: Date.now(),
      };

      setJobs((prev) => [job, ...prev].slice(0, 12));
      void processJob(id, input);
      return id;
    },
    [processJob]
  );

  const cancelJob = useCallback((jobId: string) => {
    cancelledJobsRef.current.add(jobId);
  }, []);

  const dismissJob = useCallback((jobId: string) => {
    cancelledJobsRef.current.add(jobId);
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  const clearCompletedJobs = useCallback(() => {
    setJobs((prev) => prev.filter((j) => j.status === 'running'));
  }, []);

  const value = useMemo<DashboardUploadContextValue>(
    () => ({
      jobs,
      hasActiveUploads,
      enqueueSessionMediaUpload,
      cancelJob,
      dismissJob,
      clearCompletedJobs,
      subscribeToSessionCommits,
    }),
    [
      jobs,
      hasActiveUploads,
      enqueueSessionMediaUpload,
      cancelJob,
      dismissJob,
      clearCompletedJobs,
      subscribeToSessionCommits,
    ]
  );

  return (
    <DashboardUploadContext.Provider value={value}>{children}</DashboardUploadContext.Provider>
  );
}

export function useDashboardUploads() {
  return useContext(DashboardUploadContext);
}
