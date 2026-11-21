'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './explore-categories.module.scss';
import { PaginatedTable } from '@/components/PaginatedTable';
import { ExploreCategoryFormModal } from './ExploreCategoryFormModal';
import { useAdminAccess } from '@/components/auth/AdminAccessContext';
import { ContentSkeleton } from '@/components/navigation/ContentSkeleton';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput } from '@/components/ui/SearchInput';
import { Plus, Edit2, Trash2 } from '@/components/icons';
import {
  getExploreCategoriesAction,
  deleteExploreCategoryAction,
  type ExploreCategoryListItem,
} from '@/app/actions/explore';

type FormMode = 'create' | 'edit';

const PAGE_LIMIT = 10;

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export default function ExploreCategoriesPage() {
  const router = useRouter();
  const { access, hasPermission } = useAdminAccess();
  const [categories, setCategories] = useState<ExploreCategoryListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [listRefreshKey, setListRefreshKey] = useState(0);

  const debouncedSearch = useDebouncedValue(search, 300);

  const canView =
    hasPermission('explore_categories.view') || hasPermission('explore_categories.manage');
  const canManage = hasPermission('explore_categories.manage');

  useEffect(() => {
    if (!access) return;
    if (!canView) router.replace('/dashboard');
  }, [access, canView, router]);

  useEffect(() => {
    if (!access || !canView) return;
    let cancelled = false;
    async function fetchCategories() {
      setLoading(true);
      setError(null);
      try {
        const result = await getExploreCategoriesAction({
          page,
          limit: PAGE_LIMIT,
          ...(debouncedSearch.trim() && { search: debouncedSearch.trim() }),
        });
        if (cancelled) return;
        if (!result.ok) {
          setError(result.error ?? 'Unable to load explore categories');
          return;
        }
        setCategories(result.data);
        setTotalPages(result.meta.totalPages || 1);
        setTotal(result.meta.total ?? 0);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Unable to load explore categories');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchCategories();
    return () => {
      cancelled = true;
    };
  }, [access, canView, page, debouncedSearch, listRefreshKey]);

  function openCreateForm() {
    setFormMode('create');
    setSelectedCategoryId(null);
    setFormOpen(true);
  }

  function openEditForm(cat: ExploreCategoryListItem) {
    setFormMode('edit');
    setSelectedCategoryId(cat.id);
    setFormOpen(true);
  }

  function handleFormSuccess() {
    setPage(1);
    setListRefreshKey((k) => k + 1);
  }

  async function handleDelete(cat: ExploreCategoryListItem) {
    if (
      !confirm(
        `Delete "${cat.title}"? This will remove the category and all ${cat._count.explore_items} explore item(s).`
      )
    )
      return;
    try {
      const result = await deleteExploreCategoryAction(cat.id);
      if (!result.ok) {
        alert(result.error ?? 'Failed to delete category');
        return;
      }
      setListRefreshKey((k) => k + 1);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete category');
    }
  }

  function canEditRow(cat: ExploreCategoryListItem): boolean {
    if (!canManage || !access) return false;
    if (access.tier === 'super_admin' || access.tier === 'super_staff') return true;
    const ownerId = access.tenant_owner_id ?? access.id;
    return cat.tenant_owner_id != null && cat.tenant_owner_id === ownerId;
  }

  if (!access || !canView) {
    return <ContentSkeleton />;
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Explore Categories"
        subtitle="Browse global explore categories or manage custom categories & local listings."
        breadcrumbs={[{ label: 'Admin', href: '/dashboard' }, { label: 'Explore Categories' }]}
        actions={
          canManage ? (
            <button
              type="button"
              onClick={openCreateForm}
              className={styles.newCategoryButton}
            >
              <Plus size={16} /> New category
            </button>
          ) : undefined
        }
      />

      <div className={styles.controlsRow}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <SearchInput
            placeholder="Search by title or description…"
            value={search}
            onChange={(val) => {
              setPage(1);
              setSearch(val);
            }}
          />
        </div>
      </div>

      {error && <p className={styles.errorText}>{error}</p>}

      <PaginatedTable
        header={
          <tr className={styles.tableHeadRow}>
            <th className={styles.th}>Title</th>
            <th className={styles.th}>Scope</th>
            <th className={styles.th}>Description</th>
            <th className={styles.th}>Items</th>
            <th className={styles.thActions}>Actions</th>
          </tr>
        }
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_LIMIT}
        colSpan={5}
        loading={loading}
        loadingMessage="Loading explore categories…"
        emptyMessage="No explore categories found."
        onPageChange={setPage}
      >
        {categories.map((cat) => {
          const mutable = canEditRow(cat);
          return (
            <tr key={cat.id} className={styles.rowDivider}>
              <td className={styles.td}>
                <strong>{cat.title}</strong>
              </td>
              <td className={styles.td}>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    padding: '0.15rem 0.5rem',
                    borderRadius: '999px',
                    backgroundColor: cat.tenant_owner_id
                      ? 'var(--badge-info-bg)'
                      : 'var(--badge-neutral-bg)',
                    color: cat.tenant_owner_id
                      ? 'var(--badge-info-text)'
                      : 'var(--badge-neutral-text)',
                  }}
                >
                  {cat.tenant_owner_id ? 'Private' : 'Global'}
                </span>
              </td>
              <td className={styles.td}>
                {cat.description
                  ? cat.description.length > 80
                    ? `${cat.description.slice(0, 80)}…`
                    : cat.description
                  : '—'}
              </td>
              <td className={styles.td}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '0.12rem 0.5rem',
                    borderRadius: '999px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    backgroundColor: 'var(--bg-surface-secondary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  {cat._count.explore_items} items
                </span>
              </td>
              <td className={styles.td} style={{ textAlign: 'right' }}>
                {mutable ? (
                  <div className={styles.actions}>
                    <button
                      type="button"
                      onClick={() => openEditForm(cat)}
                      className={styles.btnEdit}
                    >
                      <Edit2 size={13} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(cat)}
                      className={styles.btnDelete}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                ) : (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Global read-only</span>
                )}
              </td>
            </tr>
          );
        })}
      </PaginatedTable>

      <ExploreCategoryFormModal
        open={formOpen}
        mode={formMode}
        categoryId={selectedCategoryId}
        onClose={() => setFormOpen(false)}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}
