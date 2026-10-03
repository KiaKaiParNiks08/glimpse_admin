'use client';

import { useEffect, useState } from 'react';
import { CreateEventWizard } from './CreateEventWizard';
import {
  getEventCategoriesAction,
  getVenuesForSelectAction,
  getAppThemesForSelectAction,
} from '@/app/actions/events';
import type {
  AppThemeOption,
  EventCategoryOption,
  VenueOption,
} from '@/app/actions/events';
import styles from './events.module.scss';

type EventFormModalProps = {
  open: boolean;
  mode: 'create' | 'edit';
  eventId: string | null;
  createdBy: string;
  /** Preloaded from page; modal will refetch when open if empty so dropdowns are always filled */
  categories: EventCategoryOption[];
  venues: VenueOption[];
  onClose: () => void;
  onSuccess: () => void;
};

export function EventFormModal({
  open,
  mode,
  eventId,
  createdBy,
  categories,
  venues,
  onClose,
  onSuccess,
}: EventFormModalProps) {
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [optionsOverride, setOptionsOverride] = useState<{
    categories: EventCategoryOption[];
    venues: VenueOption[];
  } | null>(null);
  const [themes, setThemes] = useState<AppThemeOption[]>([]);

  useEffect(() => {
    if (!open) {
      setOptionsOverride(null);
      setThemes([]);
      return;
    }
    setLoadingOptions(true);
    const needCatVen = categories.length === 0 || venues.length === 0;
    const catP = needCatVen
      ? getEventCategoriesAction()
      : Promise.resolve({ ok: true as const, data: categories });
    const venP = needCatVen
      ? getVenuesForSelectAction()
      : Promise.resolve({ ok: true as const, data: venues });
    Promise.all([catP, venP, getAppThemesForSelectAction()])
      .then(([catRes, venRes, themeRes]) => {
        if (needCatVen) {
          setOptionsOverride({
            categories: catRes.ok ? catRes.data : [],
            venues: venRes.ok ? venRes.data : [],
          });
        } else {
          setOptionsOverride(null);
        }
        if (themeRes.ok) setThemes(themeRes.data);
      })
      .finally(() => setLoadingOptions(false));
  }, [open, categories, venues]);

  const formCategories = optionsOverride?.categories ?? categories;
  const formVenues = optionsOverride?.venues ?? venues;

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.modal} style={{ maxWidth: '48rem' }}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>
              {mode === 'create' ? 'Create event' : 'Edit event'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={styles.modalClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {loadingOptions ? (
          <p className={styles.wizardLoading}>Loading…</p>
        ) : (
          <CreateEventWizard
            categories={formCategories}
            venues={formVenues}
            themes={themes}
            createdBy={createdBy}
            initialEventId={mode === 'edit' && eventId ? eventId : null}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        )}
      </div>
    </div>
  );
}
