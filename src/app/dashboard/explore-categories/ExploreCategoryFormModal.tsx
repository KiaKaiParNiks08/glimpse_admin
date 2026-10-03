'use client';

import { useEffect, useState } from 'react';
import styles from './explore-categories.module.scss';
import { ExploreCategoryForm } from '@/components/ExploreCategoryForm';
import type { ExploreCategoryFormPayload } from '@/components/ExploreCategoryForm';
import { ExploreItemFormModal, type ExploreItemFormValues } from './ExploreItemFormModal';
import type { ExploreItemListItem } from '@/app/actions/explore';
import {
  getExploreCategoryByIdAction,
  createExploreCategoryAction,
  updateExploreCategoryAction,
  createExploreItemAction,
  updateExploreItemAction,
  deleteExploreItemAction,
} from '@/app/actions/explore';

export type ExploreCategoryFormData = {
  id: string;
  title: string;
  description: string | null;
  background_url: string | null;
  explore_items: Array<{
    id: string;
    category_id: string;
    title: string;
    description: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    latitude: number | null;
    longitude: number | null;
  }>;
};

type ExploreCategoryFormModalProps = {
  open: boolean;
  mode: 'create' | 'edit';
  categoryId: string | null;
  onClose: () => void;
  onSuccess: () => void;
};

export function ExploreCategoryFormModal({
  open,
  mode,
  categoryId,
  onClose,
  onSuccess,
}: ExploreCategoryFormModalProps) {
  const [category, setCategory] = useState<ExploreCategoryFormData | null>(null);
  const [loadingCategory, setLoadingCategory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [itemModalMode, setItemModalMode] = useState<'create' | 'edit'>('create');
  const [selectedItem, setSelectedItem] = useState<ExploreItemListItem | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  /** After creating a category in create mode, we show the items section; this holds the new id */
  const [createdCategoryId, setCreatedCategoryId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCreatedCategoryId(null);
      return;
    }
    setError(null);
    if (mode === 'edit' && categoryId) {
      setCreatedCategoryId(null);
      setLoadingCategory(true);
      setCategory(null);
      getExploreCategoryByIdAction(categoryId)
        .then((result) => {
          if (!result.ok) {
            setError(result.error ?? 'Failed to load category');
            return;
          }
          const data = result.data as ExploreCategoryFormData;
          setCategory(data);
        })
        .catch(() => setError('Failed to load category'))
        .finally(() => setLoadingCategory(false));
    } else if (mode === 'create') {
      setCategory(null);
      setCreatedCategoryId(null);
    }
  }, [open, mode, categoryId]);

  async function handleSubmitCategory(payload: ExploreCategoryFormPayload) {
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'create') {
        const result = await createExploreCategoryAction(payload);
        if (!result.ok) throw new Error(result.error);
        const newId = (result.data as { id: string }).id;
        const res = await getExploreCategoryByIdAction(newId);
        if (res.ok && res.data) {
          setCategory(res.data as ExploreCategoryFormData);
          setCreatedCategoryId(newId);
        } else {
          onSuccess();
          onClose();
        }
      } else if (categoryId) {
        const result = await updateExploreCategoryAction(categoryId, payload);
        if (!result.ok) throw new Error(result.error);
        onSuccess();
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  const effectiveCategoryId = categoryId ?? createdCategoryId;

  function openAddItem() {
    setSelectedItem(null);
    setItemModalMode('create');
    setItemModalOpen(true);
  }

  function openEditItem(item: ExploreItemListItem) {
    setSelectedItem(item);
    setItemModalMode('edit');
    setItemModalOpen(true);
  }

  async function handleItemSubmit(values: ExploreItemFormValues) {
    if (!effectiveCategoryId) return;
    if (itemModalMode === 'create') {
      const result = await createExploreItemAction({
        category_id: effectiveCategoryId,
        title: values.title,
        description: values.description,
        address: values.address,
        city: values.city || null,
        state: values.state || null,
        country: values.country || null,
        latitude: parseFloat(values.latitude),
        longitude: parseFloat(values.longitude),
      });
      if (!result.ok) throw new Error(result.error);
    } else if (selectedItem) {
      const result = await updateExploreItemAction(selectedItem.id, {
        title: values.title,
        description: values.description,
        address: values.address,
        city: values.city || null,
        state: values.state || null,
        country: values.country || null,
        latitude: parseFloat(values.latitude),
        longitude: parseFloat(values.longitude),
      });
      if (!result.ok) throw new Error(result.error);
    }
    setItemModalOpen(false);
    setSelectedItem(null);
    if (effectiveCategoryId) {
      const res = await getExploreCategoryByIdAction(effectiveCategoryId);
      if (res.ok && res.data) setCategory(res.data as ExploreCategoryFormData);
    }
  }

  async function handleDeleteItem(item: ExploreItemListItem) {
    if (!confirm(`Delete "${item.title}"?`)) return;
    setDeletingItemId(item.id);
    try {
      const result = await deleteExploreItemAction(item.id);
      if (!result.ok) throw new Error(result.error);
      if (category && category.explore_items) {
        setCategory({
          ...category,
          explore_items: category.explore_items.filter((i) => i.id !== item.id),
        });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete item');
    } finally {
      setDeletingItemId(null);
    }
  }

  const items = category?.explore_items ?? [];
  const showItemsSection = (mode === 'edit' && categoryId) || createdCategoryId;

  function handleClose() {
    if (createdCategoryId) onSuccess();
    onClose();
  }

  if (!open) return null;

  return (
    <>
      <div className={styles.overlay} role="dialog" aria-modal="true">
        <div className={styles.modal}>
          <div className={styles.modalHeader}>
            <div>
              <h2 className={styles.modalTitle}>
                {mode === 'create' && !createdCategoryId
                  ? 'Create explore category'
                  : 'Edit explore category'}
              </h2>
              <p className={styles.modalSubtitle}>
                {mode === 'create' && !createdCategoryId
                  ? 'Add a new category, then add explore items below.'
                  : 'Update category and manage its explore items.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className={styles.modalClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {loadingCategory ? (
            <p style={{ color: '#94a3b8' }}>Loading category…</p>
          ) : (
            <>
              {(!createdCategoryId || mode === 'edit') && (
                <ExploreCategoryForm
                  mode={mode === 'edit' ? 'edit' : 'create'}
                  category={
                    category
                      ? {
                          title: category.title,
                          description: category.description,
                          background_url: category.background_url,
                        }
                      : null
                  }
                  onSubmit={handleSubmitCategory}
                  onCancel={handleClose}
                  submitLabel={mode === 'create' && !createdCategoryId ? 'Create category' : 'Save changes'}
                  cancelLabel="Cancel"
                  loading={submitting}
                  error={error}
                />
              )}

              {showItemsSection && (
                <div className={styles.itemsSection}>
                  <div className={styles.itemsSectionTitle}>
                    <span>Explore items</span>
                    <button
                      type="button"
                      onClick={openAddItem}
                      className={styles.addItemButton}
                    >
                      + Add item
                    </button>
                  </div>
                  {items.length === 0 ? (
                    <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
                      No items yet. Add items to show in this category.
                    </p>
                  ) : (
                    <table className={styles.itemsTable}>
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>City</th>
                          <th>Country</th>
                          <th style={{ width: 120, textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it) => (
                          <tr key={it.id}>
                            <td>{it.title}</td>
                            <td>{it.city ?? '—'}</td>
                            <td>{it.country ?? '—'}</td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                type="button"
                                onClick={() => openEditItem(it as ExploreItemListItem)}
                                className={styles.btnEdit}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(it as ExploreItemListItem)}
                                disabled={deletingItemId === it.id}
                                className={styles.btnDelete}
                              >
                                {deletingItemId === it.id ? '…' : 'Delete'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ExploreItemFormModal
        open={itemModalOpen}
        mode={itemModalMode}
        categoryId={effectiveCategoryId ?? ''}
        item={selectedItem}
        onClose={() => {
          setItemModalOpen(false);
          setSelectedItem(null);
        }}
        onSubmit={handleItemSubmit}
      />
    </>
  );
}
