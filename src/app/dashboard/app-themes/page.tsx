'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PaginatedTable } from '@/components/PaginatedTable';
import { useAdminAccess } from '@/components/auth/AdminAccessContext';
import {
  deleteAppThemeAction,
  listAppThemesAction,
  type AppThemeRow,
} from '@/app/actions/app-themes';
import { AppThemeFormModal } from './AppThemeFormModal';
import styles from './app-themes.module.scss';
import { ContentSkeleton } from '@/components/navigation/ContentSkeleton';

const PAGE_LIMIT = 10;

function ColorSwatch({ color }: { color: string }) {
  return (
    <span className={styles.swatchWrap}>
      <span className={styles.swatch} style={{ backgroundColor: color }} />
      <span className={styles.swatchCode}>{color}</span>
    </span>
  );
}

function formatDate(value: string | Date | null | undefined): string {
  if (value == null) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export default function AppThemesPage() {
  const router = useRouter();
  const { access, hasPermission } = useAdminAccess();
  const [rows, setRows] = useState<AppThemeRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [selectedRow, setSelectedRow] = useState<AppThemeRow | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canView = hasPermission('app_themes.view') || hasPermission('app_themes.manage');
  const canManage = hasPermission('app_themes.manage');

  useEffect(() => {
    if (!access) return;
    if (!canView) router.replace('/dashboard');
  }, [access, canView, router]);

  useEffect(() => {
    if (!access || !canView) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await listAppThemesAction({
          page,
          limit: PAGE_LIMIT,
          search: search.trim() || undefined,
        });
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error ?? 'Unable to load app themes');
          return;
        }
        setRows(result.data);
        setTotalPages(result.meta.totalPages || 1);
        setTotal(result.meta.total ?? 0);
      } catch {
        if (!cancelled) setError('Unable to load app themes');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [access, canView, page, search, listRefreshKey]);

  function openCreate() {
    setFormMode('create');
    setSelectedRow(null);
    setFormOpen(true);
  }

  function openEdit(row: AppThemeRow) {
    setFormMode('edit');
    setSelectedRow(row);
    setFormOpen(true);
  }

  function handleFormSuccess() {
    setPage(1);
    setListRefreshKey((k) => k + 1);
  }

  async function handleDelete(row: AppThemeRow) {
    const confirmed = window.confirm(
      `Delete "${row.name}"? This keeps existing events but removes this theme from selection.`
    );
    if (!confirmed) return;
    setDeletingId(row.id);
    setError(null);
    try {
      const result = await deleteAppThemeAction(row.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setListRefreshKey((k) => k + 1);
    } finally {
      setDeletingId(null);
    }
  }

  function canEditRow(row: AppThemeRow): boolean {
    if (!canManage || !access) return false;
    if (access.tier === 'super_admin' || access.tier === 'super_staff') return true;
    const ownerId = access.tenant_owner_id ?? access.id;
    return row.tenant_owner_id != null && row.tenant_owner_id === ownerId;
  }

  if (!access || !canView) {
    return (
      <div className={styles.page}>
        <ContentSkeleton />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.headerText}>
          <h1>App themes</h1>
          <p>Use platform app color themes or create custom color themes for your events.</p>
        </div>
        {canManage && (
          <button type="button" className={styles.primaryButton} onClick={openCreate}>
            + New theme
          </button>
        )}
      </div>

      <div className={styles.controlsRow}>
        <input
          className={styles.searchInput}
          placeholder="Search theme name…"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
        />
      </div>

      {error && <p className={styles.errorText}>{error}</p>}

      <PaginatedTable
        header={
          <tr className={styles.tableHeadRow}>
            <th>Name</th>
            <th>Scope</th>
            <th>Primary</th>
            <th>Secondary</th>
            <th>Button Primary</th>
            <th>Button Secondary</th>
            <th>Updated</th>
            <th className={styles.thActions}>Actions</th>
          </tr>
        }
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_LIMIT}
        colSpan={8}
        loading={loading}
        loadingMessage="Loading themes…"
        emptyMessage="No app themes yet."
        onPageChange={setPage}
      >
        {rows.map((r) => {
          const mutable = canEditRow(r);
          return (
            <tr key={r.id} className={styles.rowDivider}>
              <td className={styles.td}>{r.name}</td>
              <td className={styles.td}>
                <span style={{ fontSize: '0.74rem', color: r.tenant_owner_id ? '#1e40af' : '#475569' }}>
                  {r.tenant_owner_id ? 'Private' : 'Global'}
                </span>
              </td>
              <td className={styles.td}>
                <ColorSwatch color={r.primary_color} />
              </td>
              <td className={styles.td}>
                <ColorSwatch color={r.secondary_color} />
              </td>
              <td className={styles.td}>
                <ColorSwatch color={r.button_primary_color} />
              </td>
              <td className={styles.td}>
                <ColorSwatch color={r.button_secondary_color} />
              </td>
              <td className={`${styles.td} ${styles.tdMuted}`}>{formatDate(r.updated_at)}</td>
              <td className={styles.td} style={{ textAlign: 'right' }}>
                {mutable ? (
                  <div className={styles.actions}>
                    <button type="button" className={styles.btnEdit} onClick={() => openEdit(r)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className={styles.btnDelete}
                      disabled={deletingId === r.id}
                      onClick={() => handleDelete(r)}
                    >
                      {deletingId === r.id ? 'Deleting…' : 'Delete'}
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

      <AppThemeFormModal
        open={formOpen}
        mode={formMode}
        row={selectedRow}
        onClose={() => setFormOpen(false)}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}
