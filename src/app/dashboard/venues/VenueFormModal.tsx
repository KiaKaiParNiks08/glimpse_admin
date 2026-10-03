'use client';

import { useEffect, useState } from 'react';
import { VenueForm } from '@/components/VenueForm';
import type { CreateVenueInput, UpdateVenueInput } from '@/lib/validations/venues';
import {
  getVenueByIdAction,
  createVenueAction,
  updateVenueAction,
} from '@/app/actions/venues';
import styles from './venues.module.scss';

export type VenueFormModalVenue = {
  id: string;
  name: string;
  address: string;
  description?: string | null;
  city?: string | null;
  state_name?: string | null;
  country?: string | null;
  postal_code?: string | null;
  latitude?: unknown;
  longitude?: unknown;
  bg_image_url?: string | null;
  venue_contacts: Array<{
    id: string;
    name: string;
    image_url?: string | null;
    phone_number?: string | null;
    email?: string | null;
    role?: string | null;
    is_primary?: boolean | null;
  }>;
  venue_facilities: Array<{ id: string; name: string; image_url?: string | null }>;
  venue_photos: Array<{
    id: string;
    image_url: string;
    alt_text?: string | null;
    sort_order?: number | null;
  }>;
  venue_subvenues?: Array<{ id: string; title: string; description?: string | null }>;
};

type VenueFormModalProps = {
  open: boolean;
  mode: 'create' | 'edit';
  venueId: string | null;
  onClose: () => void;
  onSuccess: () => void;
};

export function VenueFormModal({
  open,
  mode,
  venueId,
  onClose,
  onSuccess,
}: VenueFormModalProps) {
  const [venue, setVenue] = useState<VenueFormModalVenue | null>(null);
  const [loadingVenue, setLoadingVenue] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (mode === 'edit' && venueId) {
      setLoadingVenue(true);
      setVenue(null);
      getVenueByIdAction(venueId)
        .then((result) => {
          if (!result.ok) {
            setError(result.error ?? 'Failed to load venue');
            return;
          }
          setVenue(result.data as VenueFormModalVenue);
        })
        .catch(() => setError('Failed to load venue'))
        .finally(() => setLoadingVenue(false));
    } else {
      setVenue(null);
    }
  }, [open, mode, venueId]);

  async function handleSubmit(
    payload: Parameters<Parameters<typeof VenueForm>[0]['onSubmit']>[0]
  ) {
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'create') {
        const result = await createVenueAction(payload as CreateVenueInput);
        if (!result.ok) throw new Error(result.error);
      } else if (venueId) {
        const result = await updateVenueAction(venueId, payload as UpdateVenueInput);
        if (!result.ok) throw new Error(result.error);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>
              {mode === 'create' ? 'Create venue' : 'Edit venue'}
            </h2>
            <p className={styles.modalSubtitle}>
              {mode === 'create'
                ? 'Add a new venue with contacts, facilities, and photos.'
                : 'Update venue details.'}
            </p>
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

        {loadingVenue ? (
          <p style={{ color: '#94a3b8' }}>Loading venue…</p>
        ) : (
          <VenueForm
            mode={mode}
            venue={mode === 'edit' ? venue : null}
            onSubmit={handleSubmit}
            onCancel={onClose}
            submitLabel={mode === 'create' ? 'Create venue' : 'Save changes'}
            cancelLabel="Cancel"
            loading={submitting}
            error={error}
          />
        )}
      </div>
    </div>
  );
}
