'use client';

import { useEffect, useState } from 'react';
import styles from './explore-categories.module.scss';
import { PaginatedTable } from '@/components/PaginatedTable';
import { ExploreCategoryFormModal } from './ExploreCategoryFormModal';
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

  useEffect(() => {
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
  }, [page, debouncedSearch, listRefreshKey]);

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

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.headerText}>
          <h1>Explore categories</h1>
          <p>Manage explore categories and their items (places, venues, etc.).</p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className={styles.newCategoryButton}
        >
          + New category
        </button>
      </div>

      <div className={styles.controlsRow}>
        <input
          type="search"
          placeholder="Search by title or description…"
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
            <th className={styles.th}>Title</th>
            <th className={styles.th}>Description</th>
            <th className={styles.th}>Items</th>
            <th className={styles.thActions}>Actions</th>
          </tr>
        }
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={PAGE_LIMIT}
        colSpan={4}
        loading={loading}
        loadingMessage="Loading explore categories…"
        emptyMessage="No explore categories found."
        onPageChange={setPage}
      >
        {categories.map((cat) => (
          <tr key={cat.id} className={styles.rowDivider}>
            <td className={styles.td}>{cat.title}</td>
            <td className={styles.td}>
              {cat.description
                ? cat.description.length > 80
                  ? `${cat.description.slice(0, 80)}…`
                  : cat.description
                : '—'}
            </td>
            <td className={styles.td}>{cat._count.explore_items}</td>
            <td className={styles.td} style={{ textAlign: 'right' }}>
              <div className={styles.actions}>
                <button
                  type="button"
                  onClick={() => openEditForm(cat)}
                  className={styles.btnEdit}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(cat)}
                  className={styles.btnDelete}
                >
                  Delete
                </button>
              </div>
            </td>
          </tr>
        ))}
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
