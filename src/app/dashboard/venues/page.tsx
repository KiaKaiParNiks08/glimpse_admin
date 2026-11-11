'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './venues.module.scss';
import { PaginatedTable } from '@/components/PaginatedTable';
import { VenueFormModal } from './VenueFormModal';
import { useAdminAccess } from '@/components/auth/AdminAccessContext';
import { ContentSkeleton } from '@/components/navigation/ContentSkeleton';
import {
  getVenuesAction,
  deleteVenueAction,
} from '@/app/actions/venues';

export type VenueListItem = {
  id: string;
  name: string;
  address: string;
  city: string | null;
  state_name: string | null;
  country: string | null;
  tenant_owner_id: string | null;
  created_at: string | null;
};

type FormMode = 'create' | 'edit';

const PAGE_LIMIT = 10;

export default function DashboardVenuesPage() {
  const router = useRouter();
  const { access, hasPermission } = useAdminAccess();
  const [venues, setVenues] = useState<VenueListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  const debouncedSearch = useDebouncedValue(search, 300);

  const canView = hasPermission('venues.view') || hasPermission('venues.manage');
  const canManage = hasPermission('venues.manage');

  useEffect(() => {
    if (!access) return;
    if (!canView) router.replace('/dashboard');
  }, [access, canView, router]);

  useEffect(() => {
    if (!access || !canView) return;
    let cancelled = false;

    async function fetchVenues() {
      setLoading(true);
      setError(null);
      try {
        const result = await getVenuesAction({
          page,
          limit: PAGE_LIMIT,
          ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
        });
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error ?? 'Unable to load venues');
          return;
        }
        setVenues(result.data);
        setTotalPages(result.meta.totalPages || 1);
        setTotal(result.meta.total ?? 0);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Unable to load venues');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchVenues();
    return () => {
      cancelled = true;
    };
  }, [access, canView, page, debouncedSearch, listRefreshKey]);

  function openCreateForm() {
    setFormMode('create');
    setSelectedVenueId(null);
    setFormOpen(true);
  }

  function openEditForm(venue: VenueListItem) {
    setFormMode('edit');
    setSelectedVenueId(venue.id);
    setFormOpen(true);
  }

  function handleFormSuccess() {
    setPage(1);
    setListRefreshKey((k) => k + 1);
  }

  async function handleDelete(venue: VenueListItem) {
    if (!confirm(`Delete "${venue.name}"? This will remove all contacts, facilities, and photos.`)) return;
    try {
      const result = await deleteVenueAction(venue.id);
      if (!result.ok) {
        alert(result.error ?? 'Failed to delete venue');
        return;
      }
      setListRefreshKey((k) => k + 1);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete venue');
    }
  }

  function canEditRow(venue: VenueListItem): boolean {
    if (!canManage || !access) return false;
    if (access.tier === 'super_admin' || access.tier === 'super_staff') return true;
    const ownerId = access.tenant_owner_id ?? access.id;
    return venue.tenant_owner_id != null && venue.tenant_owner_id === ownerId;
  }

  if (!access || !canView) {
    return <ContentSkeleton />;
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.headerText}>
          <h1>Venues</h1>
          <p>Browse global platform venues or manage your custom client venues.</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreateForm}
            className={styles.newVenueButton}
          >
            + New venue
          </button>
        )}
      </div>

      <div className={styles.controlsRow}>
        <input
          type="search"
          placeholder="Search by name, address, city, country…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          className={styles.searchInput}
        />
      </div>

      {error && <p className={styles.errorText}>{error}</p>}

      <PaginatedTable
        header={
          <tr className={styles.tableHeadRow}>
            <th className={styles.th}>Name</th>
            <th className={styles.th}>Scope</th>
            <th className={styles.th}>Address</th>
            <th className={styles.th}>City</th>
            <th className={styles.th}>Country</th>
            <th className={styles.thActions}>Actions</th>
          </tr>
        }
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_LIMIT}
        colSpan={6}
        loading={loading}
        loadingMessage="Loading venues…"
        emptyMessage="No venues found."
        onPageChange={setPage}
      >
        {venues.map((venue) => {
          const mutable = canEditRow(venue);
          return (
            <tr key={venue.id} className={styles.rowDivider}>
              <td className={styles.td}>{venue.name}</td>
              <td className={styles.td}>
                <span style={{ fontSize: '0.74rem', color: venue.tenant_owner_id ? '#1e40af' : '#475569' }}>
                  {venue.tenant_owner_id ? 'Private' : 'Global'}
                </span>
              </td>
              <td className={styles.td}>{venue.address}</td>
              <td className={styles.td}>{venue.city ?? '—'}</td>
              <td className={styles.td}>{venue.country ?? '—'}</td>
              <td className={styles.td} style={{ textAlign: 'right' }}>
                {mutable ? (
                  <div className={styles.actions}>
                    <button
                      type="button"
                      onClick={() => openEditForm(venue)}
                      className={styles.btnEdit}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(venue)}
                      className={styles.btnDelete}
                    >
                      Delete
                    </button>
                  </div>
                ) : (
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Global read-only</span>
                )}
              </td>
            </tr>
          );
        })}
      </PaginatedTable>

      <VenueFormModal
        open={formOpen}
        mode={formMode}
        venueId={selectedVenueId}
        onClose={() => setFormOpen(false)}
        onSuccess={handleFormSuccess}
      />
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
