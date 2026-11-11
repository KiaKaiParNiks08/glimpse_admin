'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRouteProgress } from '@/components/navigation/NavigationProvider';
import { ContentSkeleton } from '@/components/navigation/ContentSkeleton';
import { useAdminAccess } from '@/components/auth/AdminAccessContext';
import styles from '../events.module.scss';
import { CreateEventWizard } from '../CreateEventWizard';
import {
  getEventCategoriesAction,
  getVenuesForSelectAction,
  getAppThemesForSelectAction,
  type AppThemeOption,
  type EventCategoryOption,
  type VenueOption,
} from '@/app/actions/events';

type Mode = 'create' | 'edit';

export default function AddEditEventPage() {
  const router = useRouter();
  const { pendingHref, navigate } = useRouteProgress();
  const { access, hasPermission, hasFeature } = useAdminAccess();
  const searchParams = useSearchParams();
  const modeParam = searchParams.get('mode');
  const eventIdParam = searchParams.get('eventId');
  const mode: Mode = modeParam === 'edit' ? 'edit' : 'create';
  const eventId = mode === 'edit' ? eventIdParam : null;

  const [loadingOptions, setLoadingOptions] = useState(true);
  const [categories, setCategories] = useState<EventCategoryOption[]>([]);
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [themes, setThemes] = useState<AppThemeOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pageTitle = useMemo(
    () => (mode === 'edit' ? 'Edit event' : 'Create event'),
    [mode]
  );

  useEffect(() => {
    let cancelled = false;
    setLoadingOptions(true);
    Promise.all([
      getEventCategoriesAction(),
      getVenuesForSelectAction(),
      getAppThemesForSelectAction(),
    ])
      .then(([catRes, venRes, themeRes]) => {
        if (cancelled) return;
        if (!catRes.ok || !venRes.ok || !themeRes.ok) {
          setError('Failed to load form options');
          return;
        }
        setCategories(catRes.data);
        setVenues(venRes.data);
        setThemes(themeRes.data);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load form options');
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mode === 'edit' && !eventId) {
      router.replace('/dashboard/events');
    }
  }, [mode, eventId, router]);

  if (!access || loadingOptions) {
    return <ContentSkeleton variant="form" />;
  }

  if (mode === 'create' && (!hasPermission('events.create') || !hasFeature('event_basic'))) {
    return (
      <p className={styles.errorText}>
        Your role or purchase plan does not allow creating events.
      </p>
    );
  }

  if (mode === 'edit' && !hasPermission('events.edit')) {
    return (
      <p className={styles.errorText}>
        Your role does not allow editing event configuration.
      </p>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.headerText}>
          <h1>{pageTitle}</h1>
          <p>{mode === 'edit' ? 'Update event details and enabled features.' : 'Create a new event and configure enabled steps.'}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/dashboard/events')}
          className={styles.btnSecondary}
          aria-busy={pendingHref === '/dashboard/events' || undefined}
        >
          Back to events
        </button>
      </div>

      {error && <p className={styles.errorText}>{error}</p>}

      {!error && (
        <CreateEventWizard
          categories={categories}
          venues={venues}
          themes={themes}
          createdBy={access.id}
          initialEventId={mode === 'edit' ? eventId : null}
          onClose={() => navigate('/dashboard/events')}
          onSuccess={() => navigate('/dashboard/events')}
        />
      )}
    </div>
  );
}
