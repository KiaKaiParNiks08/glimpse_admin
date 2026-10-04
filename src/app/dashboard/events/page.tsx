'use client';

import { useEffect, useState } from 'react';
import styles from './events.module.scss';
import { PaginatedTable } from '@/components/PaginatedTable';
import { CurrentHappeningModal } from './CurrentHappeningModal';
import { adminBearerAuthHeader } from '@/lib/admin-jwt-client';
import { useRouteProgress } from '@/components/navigation/NavigationProvider';
import Link from 'next/link';
import {
  getEventsAction,
  deleteEventAction,
  updateEventAction,
  getEventCategoriesAction,
  getVenuesForSelectAction,
  type EventListItem,
  type EventCategoryOption,
  type VenueOption,
} from '@/app/actions/events';

const PAGE_LIMIT = 10;

export default function DashboardEventsPage() {
  const { pendingHref, navigate } = useRouteProgress();
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentUser, setCurrentUser] = useState<{ id: string; full_name: string; email: string; role_name: string } | null>(null);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedEventTitle, setSelectedEventTitle] = useState('');
  const [currentHappeningOpen, setCurrentHappeningOpen] = useState(false);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [categories, setCategories] = useState<EventCategoryOption[]>([]);
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const headers = adminBearerAuthHeader();
    if (!headers.Authorization) {
      setCurrentUser(null);
      return;
    }

    fetch('/api/admin/me', { headers })
      .then(async (r) => {
        if (!r.ok) return;
        type AdminUser = { id: string; full_name: string; email: string; role_name: string };
        type AdminMeJson = {
          data?: { user?: AdminUser } | null;
          user?: AdminUser;
        };
        const json = (await r.json()) as AdminMeJson;
        setCurrentUser(json.data?.user ?? json.user ?? null);
      })
      .catch(() => setCurrentUser(null));
  }, []);

  // Preload categories and venues for the create/edit form
  useEffect(() => {
    let cancelled = false;
    Promise.all([getEventCategoriesAction(), getVenuesForSelectAction()]).then(
      ([catRes, venRes]) => {
        if (cancelled) return;
        if (catRes.ok) setCategories(catRes.data);
        if (venRes.ok) setVenues(venRes.data);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchEvents() {
      setLoading(true);
      setError(null);
      try {
        const result = await getEventsAction({
          page,
          limit: PAGE_LIMIT,
          ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
          ...(statusFilter && { status: statusFilter }),
        });
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error ?? 'Unable to load events');
          return;
        }
        setEvents(result.data);
        setTotalPages(result.meta.totalPages || 1);
        setTotal(result.meta.total ?? 0);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Unable to load events');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchEvents();
    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch, statusFilter, listRefreshKey]);

  function openCreateForm() {
    if (currentUser?.role_name === 'event_admin') {
      alert('Event Admin can’t create events. They can only edit assigned events.');
      return;
    }
    navigate('/dashboard/events/addEditEvent?mode=create');
  }

  function openEditForm(event: EventListItem) {
    navigate(`/dashboard/events/addEditEvent?mode=edit&eventId=${encodeURIComponent(event.id)}`);
  }

  function openCurrentHappening(event: EventListItem) {
    setSelectedEventId(event.id);
    setSelectedEventTitle(event.title);
    setCurrentHappeningOpen(true);
  }

  async function handleStatusChange(eventId: string, newStatus: string) {
    setUpdatingStatusId(eventId);
    try {
      const result = await updateEventAction(eventId, { status: newStatus });
      if (!result.ok) {
        alert(result.error ?? 'Failed to update status');
        return;
      }
      setListRefreshKey((k) => k + 1);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setUpdatingStatusId(null);
    }
  }

  async function handleExportGuests(event: EventListItem) {
    const headers = adminBearerAuthHeader();
    if (!headers.Authorization) {
      alert('Not signed in');
      return;
    }
    try {
      const res = await fetch(`/api/admin/events/${event.id}/guests/export`, { headers });
      if (!res.ok) {
        let msg = 'Export failed';
        try {
          const j = (await res.json()) as { message?: string };
          if (j?.message) msg = j.message;
        } catch {
          // ignore
        }
        alert(msg);
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition');
      const m = cd?.match(/filename="([^"]+)"/);
      const filename = m?.[1] ?? `event-${event.event_code}-guests.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Export failed');
    }
  }

  async function handleDelete(event: EventListItem) {
    if (
      !confirm(
        `Delete "${event.title}"? This will remove the event and its related data (days, sessions, highlights, etc.).`
      )
    )
      return;
    try {
      const result = await deleteEventAction(event.id);
      if (!result.ok) {
        alert(result.error ?? 'Failed to delete event');
        return;
      }
      setListRefreshKey((k) => k + 1);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete event');
    }
  }

  function formatDate(iso: string | null) {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.headerText}>
          <h1>Events</h1>
          <p>Manage events, dates, categories, and main venue.</p>
        </div>
        {currentUser?.role_name !== 'event_admin' && (
          <button
            type="button"
            onClick={openCreateForm}
            className={styles.newEventButton}
            disabled={!currentUser}
            aria-busy={pendingHref === '/dashboard/events/addEditEvent?mode=create' || undefined}
          >
            + New event
          </button>
        )}
      </div>

      <div className={styles.controlsRow}>
        <input
          type="search"
          placeholder="Search by title, slug, event code…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          className={styles.searchInput}
        />
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => {
            setPage(1);
            setStatusFilter(e.target.value);
          }}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="cancelled">Cancelled</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {error && <p className={styles.errorText}>{error}</p>}

      <PaginatedTable
        header={
          <tr className={styles.tableHeadRow}>
            <th className={styles.th}>Title</th>
            <th className={styles.th}>Code</th>
            <th className={styles.th}>Category</th>
            <th className={styles.th}>Start</th>
            <th className={styles.th}>End</th>
            <th className={styles.th}>Status</th>
            <th className={styles.th}>E-invite</th>
            <th className={styles.thActions}>Actions</th>
          </tr>
        }
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_LIMIT}
        colSpan={8}
        loading={loading}
        loadingMessage="Loading events…"
        emptyMessage="No events found."
        onPageChange={setPage}
      >
        {events.map((ev) => (
          <tr key={ev.id} className={styles.rowDivider}>
            <td className={styles.td}>{ev.title}</td>
            <td className={styles.td}>{ev.event_code}</td>
            <td className={styles.td}>{ev.event_categories?.name ?? '—'}</td>
            <td className={styles.td}>{formatDate(ev.start_date)}</td>
            <td className={styles.td}>{formatDate(ev.end_date)}</td>
            <td className={styles.td}>
              <select
                value={ev.status}
                onChange={(e) => handleStatusChange(ev.id, e.target.value)}
                disabled={updatingStatusId === ev.id}
                className={`${styles.statusSelect} ${
                  ev.status === 'published'
                    ? styles.published
                    : ev.status === 'cancelled'
                      ? styles.cancelled
                      : ev.status === 'archived'
                        ? styles.archived
                        : styles.draft
                }`}
                title="Change status"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="cancelled">Cancelled</option>
                <option value="archived">Archived</option>
              </select>
              {updatingStatusId === ev.id && (
                <span className={styles.statusUpdating}>Updating…</span>
              )}
            </td>
            <td className={styles.td}>
              {ev.e_invite_pdf_url?.trim() ? (
                <a
                  href={ev.e_invite_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.invitePdfLink}
                >
                  View PDF
                </a>
              ) : (
                '—'
              )}
            </td>
            <td className={styles.td} style={{ textAlign: 'right' }}>
              <div className={styles.actions}>
                <button
                  type="button"
                  onClick={() => openEditForm(ev)}
                  className={styles.btnEdit}
                  aria-busy={
                    pendingHref ===
                      `/dashboard/events/addEditEvent?mode=edit&eventId=${encodeURIComponent(ev.id)}` ||
                    undefined
                  }
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => openCurrentHappening(ev)}
                  className={styles.btnEdit}
                >
                  Happening
                </button>
                <Link
                  href={`/dashboard/events/${ev.id}/media`}
                  className={styles.btnEdit}
                  title="Manage day-wise media"
                >
                  Media
                </Link>
                <Link
                  href={`/dashboard/events/${ev.id}/people-media`}
                  className={styles.btnEdit}
                  title="Face processing status and matches"
                >
                  People
                </Link>
                {currentUser?.role_name === 'super_admin' && (
                  <button
                    type="button"
                    onClick={() => handleExportGuests(ev)}
                    className={styles.btnEdit}
                    title="Download guest list (CSV)"
                  >
                    Export users
                  </button>
                )}
                {currentUser?.role_name !== 'event_admin' && (
                  <button
                    type="button"
                    onClick={() => handleDelete(ev)}
                    className={styles.btnDelete}
                  >
                    Delete
                  </button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </PaginatedTable>

      {currentUser && (
        <CurrentHappeningModal
          open={currentHappeningOpen}
          eventId={selectedEventId}
          eventTitle={selectedEventTitle}
          onClose={() => setCurrentHappeningOpen(false)}
          onSuccess={() => setListRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);

  return debounced;
}
