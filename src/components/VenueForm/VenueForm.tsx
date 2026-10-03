'use client';

import { useEffect, useState } from 'react';
import styles from './VenueForm.module.scss';
import { ImageUploadField } from './ImageUploadField';
import {
  type VenueFormValues,
  type VenueContactFormItem,
  type VenueFacilityFormItem,
  type VenuePhotoFormItem,
  type VenueSubVenueFormItem,
  emptyVenueFormValues,
  createModeInitialValues,
  venueToFormValues,
  formValuesToApiPayload,
} from './types';

export interface VenueFormProps {
  /** 'create' | 'edit' */
  mode: 'create' | 'edit';
  /** Prefill when editing */
  initialData?: VenueFormValues | null;
  /** When editing, pass the full venue object from API (used to build initialData if initialData not provided) */
  venue?: {
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
  } | null;
  onSubmit: (payload: ReturnType<typeof formValuesToApiPayload>) => void | Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  error?: string | null;
}

export function VenueForm({
  mode,
  initialData,
  venue,
  onSubmit,
  onCancel,
  submitLabel,
  cancelLabel = 'Cancel',
  loading = false,
  error: externalError,
}: VenueFormProps) {
  const [values, setValues] = useState<VenueFormValues>(emptyVenueFormValues());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) setValues(initialData);
    else if (venue) setValues(venueToFormValues(venue));
    else if (mode === 'create') setValues(createModeInitialValues());
    else setValues(emptyVenueFormValues());
  }, [initialData, venue, mode]);

  const update = (partial: Partial<VenueFormValues>) => {
    setValues((prev) => ({ ...prev, ...partial }));
  };

  const updateContact = (index: number, partial: Partial<VenueContactFormItem>) => {
    setValues((prev) => {
      const next = [...prev.venue_contacts];
      next[index] = { ...next[index], ...partial };
      return { ...prev, venue_contacts: next };
    });
  };
  const addContact = () => {
    setValues((prev) => ({
      ...prev,
      venue_contacts: [...prev.venue_contacts, { name: '', is_primary: false }],
    }));
  };
  const removeContact = (index: number) => {
    setValues((prev) => ({
      ...prev,
      venue_contacts: prev.venue_contacts.filter((_, i) => i !== index),
    }));
  };

  const updateFacility = (index: number, partial: Partial<VenueFacilityFormItem>) => {
    setValues((prev) => {
      const next = [...prev.venue_facilities];
      next[index] = { ...next[index], ...partial };
      return { ...prev, venue_facilities: next };
    });
  };
  const addFacility = () => {
    setValues((prev) => ({
      ...prev,
      venue_facilities: [...prev.venue_facilities, { name: '' }],
    }));
  };
  const removeFacility = (index: number) => {
    setValues((prev) => ({
      ...prev,
      venue_facilities: prev.venue_facilities.filter((_, i) => i !== index),
    }));
  };

  const updatePhoto = (index: number, partial: Partial<VenuePhotoFormItem>) => {
    setValues((prev) => {
      const next = [...prev.venue_photos];
      next[index] = { ...next[index], ...partial };
      return { ...prev, venue_photos: next };
    });
  };
  const addPhoto = () => {
    setValues((prev) => ({
      ...prev,
      venue_photos: [...prev.venue_photos, { image_url: '', sort_order: prev.venue_photos.length }],
    }));
  };
  const removePhoto = (index: number) => {
    setValues((prev) => ({
      ...prev,
      venue_photos: prev.venue_photos.filter((_, i) => i !== index),
    }));
  };

  const updateSubVenue = (index: number, partial: Partial<VenueSubVenueFormItem>) => {
    setValues((prev) => {
      const next = [...prev.venue_subvenues];
      next[index] = { ...next[index], ...partial };
      return { ...prev, venue_subvenues: next };
    });
  };
  const addSubVenue = () => {
    setValues((prev) => ({
      ...prev,
      venue_subvenues: [...prev.venue_subvenues, { title: '', description: '' }],
    }));
  };
  const removeSubVenue = (index: number) => {
    setValues((prev) => ({
      ...prev,
      venue_subvenues: prev.venue_subvenues.filter((_, i) => i !== index),
    }));
  };

  function subVenueValidationError(v: VenueFormValues): string | null {
    const partial = v.venue_subvenues.some(
      (s) => !s.title.trim() && (s.description ?? '').trim()
    );
    if (partial) return 'Title is required for each sub-venue that has a description.';
    return null;
  }

  function getCreateModeErrors(): string | null {
    if (!values.name.trim()) return 'Name is required';
    if (!values.address.trim()) return 'Address is required';
    if (!values.description.trim()) return 'Description is required';
    if (!values.city.trim()) return 'City is required';
    if (!values.state_name.trim()) return 'State is required';
    const lat = values.latitude.trim();
    if (!lat) return 'Latitude is required';
    const latNum = Number(lat);
    if (Number.isNaN(latNum) || latNum < -90 || latNum > 90) return 'Latitude must be a number between -90 and 90';
    const long = values.longitude.trim();
    if (!long) return 'Longitude is required';
    const longNum = Number(long);
    if (Number.isNaN(longNum) || longNum < -180 || longNum > 180) return 'Longitude must be a number between -180 and 180';
    if (!values.bg_image_url.trim()) return 'Background image is required (upload an image)';
    const hasPartialContact = values.venue_contacts.some(
      (c) => (c.name.trim() && !(c.phone_number ?? '').trim()) || (!c.name.trim() && (c.phone_number ?? '').trim())
    );
    if (hasPartialContact) return 'Name and phone are required for each contact.';
    const validContacts = values.venue_contacts.filter((c) => c.name.trim() && (c.phone_number ?? '').trim());
    if (validContacts.length < 1) return 'At least one contact with name and phone is required.';
    const hasFacilityWithEmptyName = values.venue_facilities.some((f) => !f.name.trim());
    if (values.venue_facilities.length > 0 && hasFacilityWithEmptyName) return 'Facility name is required for each facility.';
    const validFacilities = values.venue_facilities.filter((f) => f.name.trim());
    if (validFacilities.length < 1) return 'At least one facility is required.';
    const validPhotos = values.venue_photos.filter((p) => p.image_url.trim());
    if (validPhotos.length < 2) return 'At least two photos are required';
    return subVenueValidationError(values);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === 'create') {
      const createErr = getCreateModeErrors();
      if (createErr) {
        setError(createErr);
        return;
      }
    } else {
      if (!values.name.trim()) {
        setError('Name is required');
        return;
      }
      if (!values.address.trim()) {
        setError('Address is required');
        return;
      }
      const hasPartialContact = values.venue_contacts.some(
        (c) => (c.name.trim() && !(c.phone_number ?? '').trim()) || (!c.name.trim() && (c.phone_number ?? '').trim())
      );
      if (hasPartialContact) {
        setError('Name and phone are required for each contact.');
        return;
      }
      const validContacts = values.venue_contacts.filter((c) => c.name.trim() && (c.phone_number ?? '').trim());
      if (validContacts.length < 1) {
        setError('At least one contact with name and phone is required.');
        return;
      }
      if (values.venue_facilities.some((f) => !f.name.trim())) {
        setError('Facility name is required for each facility.');
        return;
      }
      const validFacilities = values.venue_facilities.filter((f) => f.name.trim());
      if (validFacilities.length < 1) {
        setError('At least one facility is required.');
        return;
      }
      const subErr = subVenueValidationError(values);
      if (subErr) {
        setError(subErr);
        return;
      }
    }
    const payload = formValuesToApiPayload(values);
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  const displayError = externalError ?? error;
  const submitText = submitLabel ?? (mode === 'create' ? 'Create venue' : 'Save changes');

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {displayError && <p className={styles.error}>{displayError}</p>}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Basic info</div>
        <div className={styles.fieldRow}>
          <div className={styles.field} style={{ flex: '1 1 200px' }}>
            <label className={styles.label}>Name<span className={styles.required}> *</span></label>
            <input
              type="text"
              className={styles.input}
              value={values.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="Venue name"
            />
          </div>
          <div className={styles.field} style={{ flex: '1 1 200px' }}>
            <label className={styles.label}>Address<span className={styles.required}> *</span></label>
            <input
              type="text"
              className={styles.input}
              value={values.address}
              onChange={(e) => update({ address: e.target.value })}
              placeholder="Full address"
            />
          </div>
        </div>
        <div style={{ marginTop: '0.5rem' }}>
          <label className={styles.label}>
            Description{mode === 'create' && <span className={styles.required}> *</span>}
          </label>
          <textarea
            className={styles.textarea}
            value={values.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="Short description"
            rows={2}
          />
        </div>
        <div className={styles.fieldRow} style={{ marginTop: '0.5rem' }}>
          <div className={styles.field}>
            <label className={styles.label}>
              City{mode === 'create' && <span className={styles.required}> *</span>}
            </label>
            <input
              type="text"
              className={styles.input}
              value={values.city}
              onChange={(e) => update({ city: e.target.value })}
              placeholder="City"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>
              State{mode === 'create' && <span className={styles.required}> *</span>}
            </label>
            <input
              type="text"
              className={styles.input}
              value={values.state_name}
              onChange={(e) => update({ state_name: e.target.value })}
              placeholder="State / Region"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Country</label>
            <input
              type="text"
              className={styles.input}
              value={values.country}
              onChange={(e) => update({ country: e.target.value })}
              placeholder="Country"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Postal code</label>
            <input
              type="text"
              className={styles.input}
              value={values.postal_code}
              onChange={(e) => update({ postal_code: e.target.value })}
              placeholder="Postal code"
            />
          </div>
        </div>
        <div className={styles.fieldRow} style={{ marginTop: '0.5rem' }}>
          <div className={styles.field}>
            <label className={styles.label}>
              Latitude{mode === 'create' && <span className={styles.required}> *</span>}
            </label>
            <input
              type="text"
              className={styles.input}
              value={values.latitude}
              onChange={(e) => update({ latitude: e.target.value })}
              placeholder="e.g. 40.7128"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>
              Longitude{mode === 'create' && <span className={styles.required}> *</span>}
            </label>
            <input
              type="text"
              className={styles.input}
              value={values.longitude}
              onChange={(e) => update({ longitude: e.target.value })}
              placeholder="e.g. -74.0060"
            />
          </div>
          <div className={styles.field} style={{ flex: '1 1 100%' }}>
            <ImageUploadField
              value={values.bg_image_url}
              onChange={(url) => update({ bg_image_url: url })}
              label="Background image"
              required={mode === 'create'}
              uploadPrefix="venues"
            />
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Sub-venues</div>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#94a3b8' }}>
          Optional areas or spaces within this venue (title and description only).
        </p>
        <div className={styles.arraySection}>
          {values.venue_subvenues.map((s, i) => (
            <div key={s.id ?? `sv-${i}`} className={styles.arrayItem}>
              <div className={styles.arrayItemFields} style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.5rem' }}>
                <input
                  className={styles.arrayItemInput}
                  placeholder="Title"
                  value={s.title}
                  onChange={(e) => updateSubVenue(i, { title: e.target.value })}
                />
                <textarea
                  className={styles.textarea}
                  placeholder="Description"
                  value={s.description}
                  onChange={(e) => updateSubVenue(i, { description: e.target.value })}
                  rows={2}
                  style={{ minHeight: '4rem', resize: 'vertical' }}
                />
              </div>
              <button type="button" className={styles.btnRemove} onClick={() => removeSubVenue(i)}>Remove</button>
            </div>
          ))}
          <button type="button" className={styles.btnAdd} onClick={addSubVenue}>+ Add sub-venue</button>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          Contacts{mode === 'create' && ' (at least one required; name and phone required)'}
        </div>
        <div className={styles.arraySection}>
          {values.venue_contacts.map((c, i) => (
            <div key={c.id ?? `c-${i}`} className={styles.arrayItem}>
              <div className={styles.arrayItemFields}>
                <input
                  className={styles.arrayItemInput}
                  placeholder="Name *"
                  value={c.name}
                  onChange={(e) => updateContact(i, { name: e.target.value })}
                />
                <input
                  className={styles.arrayItemInput}
                  placeholder="Phone *"
                  value={c.phone_number ?? ''}
                  onChange={(e) => updateContact(i, { phone_number: e.target.value || null })}
                />
                <input
                  className={styles.arrayItemInput}
                  placeholder="Email"
                  type="email"
                  value={c.email ?? ''}
                  onChange={(e) => updateContact(i, { email: e.target.value || null })}
                />
                <input
                  className={styles.arrayItemInput}
                  placeholder="Role"
                  value={c.role ?? ''}
                  onChange={(e) => updateContact(i, { role: e.target.value || null })}
                />
                <ImageUploadField
                  value={c.image_url ?? ''}
                  onChange={(url) => updateContact(i, { image_url: url || null })}
                  label="Photo"
                  compact
                  uploadPrefix="venues"
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                  <input
                    type="checkbox"
                    checked={c.is_primary ?? false}
                    onChange={(e) => updateContact(i, { is_primary: e.target.checked })}
                  />
                  Primary
                </label>
              </div>
              <button type="button" className={styles.btnRemove} onClick={() => removeContact(i)}>Remove</button>
            </div>
          ))}
          <button type="button" className={styles.btnAdd} onClick={addContact}>+ Add contact</button>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          Facilities{mode === 'create' && ' (at least one required; facility name required)'}
        </div>
        <div className={styles.arraySection}>
          {values.venue_facilities.map((f, i) => (
            <div key={f.id ?? `f-${i}`} className={styles.arrayItem}>
              <div className={styles.arrayItemFields}>
                <input
                  className={styles.arrayItemInput}
                  placeholder="Facility name *"
                  value={f.name}
                  onChange={(e) => updateFacility(i, { name: e.target.value })}
                />
                <ImageUploadField
                  value={f.image_url ?? ''}
                  onChange={(url) => updateFacility(i, { image_url: url || null })}
                  label="Image"
                  compact
                  uploadPrefix="venues"
                />
              </div>
              <button type="button" className={styles.btnRemove} onClick={() => removeFacility(i)}>Remove</button>
            </div>
          ))}
          <button type="button" className={styles.btnAdd} onClick={addFacility}>+ Add facility</button>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          Photos{mode === 'create' && ' (at least two required)'}
        </div>
        <div className={styles.arraySection}>
          {values.venue_photos.map((p, i) => (
            <div key={p.id ?? `p-${i}`} className={styles.arrayItem}>
              <div className={styles.arrayItemFields}>
                <ImageUploadField
                  value={p.image_url}
                  onChange={(url) => updatePhoto(i, { image_url: url })}
                  label={mode === 'create' ? 'Image *' : 'Image'}
                  required={mode === 'create'}
                  compact
                  uploadPrefix="venues"
                />
                <input
                  className={styles.arrayItemInput}
                  placeholder="Alt text"
                  value={p.alt_text ?? ''}
                  onChange={(e) => updatePhoto(i, { alt_text: e.target.value || null })}
                />
                <input
                  className={styles.arrayItemInput}
                  type="number"
                  placeholder="Order"
                  style={{ maxWidth: '4rem' }}
                  value={p.sort_order ?? ''}
                  onChange={(e) => updatePhoto(i, { sort_order: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </div>
              <button type="button" className={styles.btnRemove} onClick={() => removePhoto(i)}>Remove</button>
            </div>
          ))}
          <button type="button" className={styles.btnAdd} onClick={addPhoto}>+ Add photo</button>
        </div>
      </div>

      <div className={styles.formActions}>
        {onCancel && (
          <button type="button" className={styles.btnCancel} onClick={onCancel}>
            {cancelLabel}
          </button>
        )}
        <button type="submit" className={styles.btnSubmit} disabled={loading}>
          {loading ? 'Saving…' : submitText}
        </button>
      </div>
    </form>
  );
}
