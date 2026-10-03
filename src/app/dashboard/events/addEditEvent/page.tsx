'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from '../events.module.scss';
import { CreateEventWizard } from '../CreateEventWizard';
import { adminBearerAuthHeader } from '@/lib/admin-jwt-client';
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
  const searchParams = useSearchParams();
  const modeParam = searchParams.get('mode');
  const eventIdParam = searchParams.get('eventId');
  const mode: Mode = modeParam === 'edit' ? 'edit' : 'create';
  const eventId = mode === 'edit' ? eventIdParam : null;

  const [currentUser, setCurrentUser] = useState<{
    id: string;
    full_name: string;
    email: string;
    role_name: string;
  } | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
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
    const headers = adminBearerAuthHeader();
    if (!headers.Authorization) {
      setCurrentUser(null);
      setLoadingUser(false);
      return;
    }
    fetch('/api/admin/me', { headers })
      .then(async (r) => {
        if (!r.ok) {
          setCurrentUser(null);
          return;
        }
        type AdminUser = { id: string; full_name: string; email: string; role_name: string };
        type AdminMeJson = { data?: { user?: AdminUser } | null; user?: AdminUser };
        const json = (await r.json()) as AdminMeJson;
        setCurrentUser(json.data?.user ?? json.user ?? null);
      })
      .catch(() => setCurrentUser(null))
      .finally(() => setLoadingUser(false));
  }, []);

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

  if (loadingUser || loadingOptions) {
    return <p className={styles.wizardLoading}>Loading…</p>;
  }

  if (!currentUser) {
    return <p className={styles.errorText}>You are not authorized. Please login again.</p>;
  }

  if (mode === 'create' && currentUser.role_name === 'event_admin') {
    return <p className={styles.errorText}>Event Admin can’t create events. They can only edit assigned events.</p>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div className={styles.headerText}>
          <h1>{pageTitle}</h1>
          <p>{mode === 'edit' ? 'Update event details and related data.' : 'Create a new event and configure all steps.'}</p>
        </div>
        <button type="button" onClick={() => router.push('/dashboard/events')} className={styles.btnSecondary}>
          Back to events
        </button>
      </div>

      {error && <p className={styles.errorText}>{error}</p>}

      {!error && (
        <CreateEventWizard
          categories={categories}
          venues={venues}
          themes={themes}
          createdBy={currentUser.id}
          initialEventId={mode === 'edit' ? eventId : null}
          onClose={() => router.push('/dashboard/events')}
          onSuccess={() => router.push('/dashboard/events')}
        />
      )}
    </div>
  );
}
