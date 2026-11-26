'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRouteProgress } from '@/components/navigation/NavigationProvider';
import { ContentSkeleton } from '@/components/navigation/ContentSkeleton';
import { useAdminAccess } from '@/components/auth/AdminAccessContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { ArrowLeft } from '@/components/icons';
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
  const [isAuthError, setIsAuthError] = useState(false);

  const pageTitle = useMemo(
    () => (mode === 'edit' ? 'Edit event' : 'Create event'),
    [mode]
  );

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    setError(null);
    setIsAuthError(false);

    try {
      const [catRes, venRes, themeRes] = await Promise.all([
        getEventCategoriesAction(),
        getVenuesForSelectAction(),
        getAppThemesForSelectAction(),
      ]);

      if (!catRes.ok || !venRes.ok) {
        const failedActions: string[] = [];
        let authFailed = false;

        if (!catRes.ok) {
          failedActions.push(`Categories (${catRes.error})`);
          if (catRes.error?.toLowerCase().includes('authenticated')) authFailed = true;
        }
        if (!venRes.ok) {
          failedActions.push(`Venues (${venRes.error})`);
          if (venRes.error?.toLowerCase().includes('authenticated')) authFailed = true;
        }

        setIsAuthError(authFailed);
        setError(`Failed to load options: ${failedActions.join(' • ')}`);
        return;
      }

      setCategories(catRes.data);
      setVenues(venRes.data);
      if (themeRes.ok) {
        setThemes(themeRes.data);
      } else {
        console.warn('App themes could not be loaded, proceeding with empty theme list:', themeRes.error);
        setThemes([]);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unexpected network error loading form options'
      );
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

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
      <PageHeader
        title={pageTitle}
        subtitle={
          mode === 'edit'
            ? 'Update event details and enabled features.'
            : 'Create a new event and configure enabled steps.'
        }
        breadcrumbs={[
          { label: 'Admin', href: '/dashboard' },
          { label: 'Events', href: '/dashboard/events' },
          { label: pageTitle },
        ]}
        actions={
          <button
            type="button"
            onClick={() => navigate('/dashboard/events')}
            className={styles.btnSecondary}
            aria-busy={pendingHref === '/dashboard/events' || undefined}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <ArrowLeft size={14} /> Back to events
          </button>
        }
      />

      {error && (
        <div
          style={{
            margin: '1.5rem 0',
            padding: '1.25rem',
            borderRadius: '0.5rem',
            background: 'var(--color-danger-subtle, #fef2f2)',
            border: '1px solid var(--color-danger-border, #fecaca)',
            color: 'var(--color-danger-text, #991b1b)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
            {isAuthError
              ? 'Your admin session has expired or is unauthorized'
              : 'Unable to initialize event form options'}
          </div>
          <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>{error}</div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
            {isAuthError ? (
              <a
                href="/login"
                className={styles.btnPrimary}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  textDecoration: 'none',
                }}
              >
                Sign In Again
              </a>
            ) : (
              <button
                type="button"
                onClick={loadOptions}
                className={styles.btnPrimary}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                }}
              >
                Try Again
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/dashboard/events')}
              className={styles.btnSecondary}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
              }}
            >
              Back to Events
            </button>
          </div>
        </div>
      )}

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
