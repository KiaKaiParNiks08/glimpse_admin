'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PaginatedTable } from '@/components/PaginatedTable';
import { adminBearerAuthHeader } from '@/lib/admin-jwt-client';
import { signOutToLogin } from '@/lib/admin-sign-out';
import { canAccessModule } from '@/lib/rbac';
import { listAppConfigurationsAction, type AppConfigurationRow } from '@/app/actions/app-configurations';
import { AppConfigFormModal } from './AppConfigFormModal';
import styles from './app-config.module.scss';
import { ContentSkeleton } from '@/components/navigation/ContentSkeleton';

const PAGE_LIMIT = 10;

function formatDate(value: string | Date | null | undefined): string {
  if (value == null) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export default function AppConfigPage() {
  const router = useRouter();
  const [rows, setRows] = useState<AppConfigurationRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessChecked, setAccessChecked] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [selectedRow, setSelectedRow] = useState<AppConfigurationRow | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const headers = adminBearerAuthHeader();
    if (!headers.Authorization) {
      void signOutToLogin(router);
      return;
    }

    fetch('/api/admin/me', { headers })
      .then(async (r) => {
        if (!r.ok) throw new Error('NOT_AUTH');
        type AdminUser = { role_name: string };
        type AdminMeJson = { data?: { user?: AdminUser } | null; user?: AdminUser };
        const json = (await r.json()) as AdminMeJson;
        const roleName = json.data?.user?.role_name ?? json.user?.role_name;
        if (!canAccessModule(roleName, 'app-config')) {
          router.replace('/dashboard');
          return;
        }
        setAccessChecked(true);
      })
      .catch(() => void signOutToLogin(router));
  }, [router]);

  useEffect(() => {
    if (!accessChecked) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await listAppConfigurationsAction({ page, limit: PAGE_LIMIT });
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error ?? 'Unable to load configurations');
          return;
        }
        setRows(result.data);
        setTotalPages(result.meta.totalPages || 1);
        setTotal(result.meta.total ?? 0);
      } catch {
        if (!cancelled) setError('Unable to load configurations');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [accessChecked, page, listRefreshKey]);

  function openCreate() {
    setFormMode('create');
    setSelectedRow(null);
    setFormOpen(true);
  }

  function openEdit(row: AppConfigurationRow) {
    setFormMode('edit');
    setSelectedRow(row);
    setFormOpen(true);
  }

  function handleFormSuccess() {
    setPage(1);
    setListRefreshKey((k) => k + 1);
  }

  if (!accessChecked) {
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
          <h1>App configuration</h1>
          <p>Store URLs, versioning, and update policy per platform (super admin only).</p>
        </div>
        <button type="button" className={styles.primaryButton} onClick={openCreate}>
          + New platform
        </button>
      </div>

      {error && <p className={styles.errorText}>{error}</p>}

      <PaginatedTable
        header={
          <tr className={styles.tableHeadRow}>
            <th>Platform</th>
            <th>App name</th>
            <th>Store URL</th>
            <th>Versions</th>
            <th>Flags</th>
            <th>Updated</th>
            <th className={styles.thActions}>Actions</th>
          </tr>
        }
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_LIMIT}
        colSpan={7}
        loading={loading}
        loadingMessage="Loading configurations…"
        emptyMessage="No app configurations yet."
        onPageChange={setPage}
      >
        {rows.map((r) => (
          <tr key={r.id} className={styles.rowDivider}>
            <td className={styles.td}>{r.platform}</td>
            <td className={styles.td}>{r.app_name ?? '—'}</td>
            <td className={`${styles.td} ${styles.tdMuted}`} title={r.store_url}>
              {r.store_url}
            </td>
            <td className={styles.td}>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                cur {r.current_version ?? '—'}
                <br />
                min {r.minimum_supported_version ?? '—'}
              </span>
            </td>
            <td className={styles.td}>
              <span className={`${styles.badge} ${r.force_update ? styles.badgeOn : styles.badgeOff}`}>
                {r.force_update ? 'force' : 'optional'}
              </span>{' '}
              <span className={`${styles.badge} ${r.is_active !== false ? styles.badgeOn : styles.badgeOff}`}>
                {r.is_active !== false ? 'active' : 'off'}
              </span>
            </td>
            <td className={`${styles.td} ${styles.tdMuted}`}>{formatDate(r.updated_at)}</td>
            <td className={styles.td} style={{ textAlign: 'right' }}>
              <div className={styles.actions}>
                <button type="button" className={styles.btnEdit} onClick={() => openEdit(r)}>
                  Edit
                </button>
              </div>
            </td>
          </tr>
        ))}
      </PaginatedTable>

      <AppConfigFormModal
        open={formOpen}
        mode={formMode}
        row={selectedRow}
        onClose={() => setFormOpen(false)}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}
