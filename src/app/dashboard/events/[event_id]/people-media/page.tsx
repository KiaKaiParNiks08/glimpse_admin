'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { PaginatedTable } from '@/components/PaginatedTable';
import { ContentSkeleton } from '@/components/navigation/ContentSkeleton';
import { adminBearerAuthHeader } from '@/lib/admin-jwt-client';
import styles from '../../events.module.scss';

type Counts = { pending: number; processing: number; ready: number; failed: number };

type MediaRow = {
  id: string;
  source: string;
  media_type: string;
  processing_status: string;
  face_count: number;
  match_count: number;
  attempt_count: number;
  last_error: string | null;
  created_at: string | null;
};

type ReferenceRow = {
  user_id: string;
  full_name: string;
  consent: boolean;
  processing_status: string;
  attempt_count: number;
  last_error: string | null;
  has_embedding: boolean;
};

type Payload = {
  event: { id: string; title: string };
  counts: Counts;
  media: MediaRow[];
  face_references: ReferenceRow[];
};

const PAGE_LIMIT = 20;

export default function PeopleMediaPage({ params }: { params: Promise<{ event_id: string }> }) {
  const { event_id: eventId } = use(params);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [payload, setPayload] = useState<Payload | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: String(page), limit: String(PAGE_LIMIT) });
      if (status) query.set('status', status);
      const response = await fetch(`/api/admin/events/${eventId}/people-media?${query}`, {
        headers: adminBearerAuthHeader(),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.message || 'Unable to load people in media');
        setPayload(null);
        return;
      }
      setPayload(body.data as Payload);
      setTotal(body.meta?.total ?? 0);
    } catch {
      setError('Unable to load people in media');
    } finally {
      setLoading(false);
    }
  }, [eventId, page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function retry(body: { media_asset_id?: string; user_id?: string }) {
    const id = body.media_asset_id ?? body.user_id ?? '';
    setBusyId(id);
    setError('');
    try {
      const response = await fetch(`/api/admin/events/${eventId}/people-media`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...adminBearerAuthHeader() },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.message || 'Unable to queue processing');
        return;
      }
      await load();
    } catch {
      setError('Unable to queue processing');
    } finally {
      setBusyId('');
    }
  }

  if (loading && !payload) return <ContentSkeleton variant="table" />;

  const counts = payload?.counts;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.headerText}>
          <h1>People in media</h1>
          <p>{payload?.event.title ?? 'Event media processing'}</p>
        </div>
        <Link href="/dashboard/events" className={styles.newEventButton}>
          Back to events
        </Link>
      </div>

      {counts && (
        <p className={styles.uploadLimitsNote}>
          Pending {counts.pending} · Processing {counts.processing} · Ready {counts.ready} · Failed {counts.failed}
        </p>
      )}

      <div className={styles.controlsRow}>
        <select
          className={styles.filterSelect}
          value={status}
          onChange={(event) => {
            setPage(1);
            setStatus(event.target.value);
          }}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="ready">Ready</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {error && <p className={styles.errorText}>{error}</p>}

      <PaginatedTable
        header={
          <tr className={styles.tableHeadRow}>
            <th className={styles.th}>Source</th>
            <th className={styles.th}>Type</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Faces</th>
            <th className={styles.th}>Matches</th>
            <th className={styles.th}>Attempts</th>
            <th className={styles.th}>Error</th>
            <th className={styles.th}></th>
          </tr>
        }
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_LIMIT}
        colSpan={8}
        loading={loading}
        emptyMessage="No media has been registered for face search yet."
        onPageChange={setPage}
      >
        {(payload?.media ?? []).map((row) => (
          <tr key={row.id} className={styles.rowDivider}>
            <td className={styles.td}>{row.source === 'user_post' ? 'User post' : 'Photographer'}</td>
            <td className={styles.td}>{row.media_type}</td>
            <td className={styles.td}>{row.processing_status}</td>
            <td className={styles.td}>{row.face_count}</td>
            <td className={styles.td}>{row.match_count}</td>
            <td className={styles.td}>{row.attempt_count}</td>
            <td className={styles.td}>{row.last_error || '—'}</td>
            <td className={styles.td}>
              {row.processing_status === 'failed' && (
                <button
                  type="button"
                  className={styles.btnEdit}
                  disabled={busyId === row.id}
                  onClick={() => void retry({ media_asset_id: row.id })}
                >
                  Retry
                </button>
              )}
            </td>
          </tr>
        ))}
      </PaginatedTable>

      <div className={styles.headerText} style={{ marginTop: '1.5rem' }}>
        <h1>Guest face references</h1>
        <p>Consent status and failed jobs for guests of this event. Embeddings are not shown.</p>
      </div>
      <PaginatedTable
        header={
          <tr className={styles.tableHeadRow}>
            <th className={styles.th}>Guest</th>
            <th className={styles.th}>Consent</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>Embedding stored</th>
            <th className={styles.th}>Error</th>
            <th className={styles.th}></th>
          </tr>
        }
        page={1}
        totalPages={1}
        total={payload?.face_references.length ?? 0}
        pageSize={Math.max(payload?.face_references.length ?? 0, 1)}
        colSpan={6}
        emptyMessage="No guests have registered a face reference."
        onPageChange={() => undefined}
      >
        {(payload?.face_references ?? []).map((row) => (
          <tr key={row.user_id} className={styles.rowDivider}>
            <td className={styles.td}>{row.full_name}</td>
            <td className={styles.td}>{row.consent ? 'Yes' : 'No'}</td>
            <td className={styles.td}>{row.processing_status}</td>
            <td className={styles.td}>{row.has_embedding ? 'Yes' : 'No'}</td>
            <td className={styles.td}>{row.last_error || '—'}</td>
            <td className={styles.td}>
              {row.consent && row.processing_status === 'failed' && (
                <button
                  type="button"
                  className={styles.btnEdit}
                  disabled={busyId === row.user_id}
                  onClick={() => void retry({ user_id: row.user_id })}
                >
                  Retry
                </button>
              )}
            </td>
          </tr>
        ))}
      </PaginatedTable>
    </div>
  );
}
