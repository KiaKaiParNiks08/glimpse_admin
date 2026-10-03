'use client';

import { useEffect, useState } from 'react';
import styles from './EventForm.module.scss';
import { ImageUploadField } from '@/components/VenueForm/ImageUploadField';
import { PdfInviteUploadField } from '@/components/EventForm/PdfInviteUploadField';
import {
  PostEventPdfUploadField,
  type PostEventReportSettings,
} from '@/components/EventForm/PostEventPdfUploadField';
import { CoverImagesField } from '@/components/EventForm/CoverImagesField';
import { MAX_EVENT_COVER_IMAGES, type CreateEventInput } from '@/lib/validations/events';
import {
  isCorporateCategory,
  isLinkedInUrl,
  isWeddingCategory as isWedding,
  LINKEDIN_URL_ERROR,
} from '@/lib/event-categories';
import type { AppThemeOption, EventCategoryOption, VenueOption } from '@/app/actions/events';
import { AppThemeAddModal } from '@/components/EventForm/AppThemeAddModal';

export type EventFormValues = {
  category_id: string;
  title: string;
  slug: string;
  event_code: string;
  description: string;
  organizer_name: string;
  organizer_logo_url: string;
  organizer_contact_email: string;
  organizer_contact_phone: string;
  organizer_website_url: string;
  groom_name: string;
  bride_name: string;
  greetings_text: string;
  linkedin_url: string;
  app_theme_id: string;
  /** In display order; the first one is saved as events.cover_image */
  cover_images: string[];
  e_invite_pdf_url: string;
  start_date: string;
  end_date: string;
  main_venue_id: string;
  status: string;
};

function emptyValues(): EventFormValues {
  const today = new Date().toISOString().slice(0, 10);
  return {
    category_id: '',
    title: '',
    slug: '',
    event_code: '',
    description: '',
    organizer_name: '',
    organizer_logo_url: '',
    organizer_contact_email: '',
    organizer_contact_phone: '',
    organizer_website_url: '',
    groom_name: '',
    bride_name: '',
    greetings_text: '',
    linkedin_url: '',
    app_theme_id: '',
    cover_images: [],
    e_invite_pdf_url: '',
    start_date: today,
    end_date: today,
    main_venue_id: '',
    status: 'draft',
  };
}

/** Normalize to YYYY-MM-DD for <input type="date"> */
function toDateOnly(value: string | Date | null | undefined): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length >= 10) return trimmed.slice(0, 10);
    return trimmed;
  }
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return '';
}

function eventToFormValues(event: {
  category_id: string;
  title: string;
  slug: string;
  event_code: string;
  description?: string | null;
  organizer_name?: string | null;
  organizer_logo_url?: string | null;
  organizer_contact_email?: string | null;
  organizer_contact_phone?: string | null;
  organizer_website_url?: string | null;
  groom_name?: string | null;
  bride_name?: string | null;
  greetings_text?: string | null;
  linkedin_url?: string | null;
  app_theme_id?: string | null;
  app_themes?: AppThemeOption | null;
  cover_image?: string | null;
  cover_images?: string[] | null;
  event_cover_images?: { image_url: string }[] | null;
  e_invite_pdf_url?: string | null;
  start_date: string;
  end_date: string;
  main_venue_id?: string | null;
  status: string;
}): EventFormValues {
  const start = toDateOnly(event.start_date);
  const end = toDateOnly(event.end_date);
  return {
    category_id: event.category_id ?? '',
    title: event.title ?? '',
    slug: event.slug ?? '',
    event_code: event.event_code ?? '',
    description: event.description ?? '',
    organizer_name: event.organizer_name ?? '',
    organizer_logo_url: event.organizer_logo_url ?? '',
    organizer_contact_email: event.organizer_contact_email ?? '',
    organizer_contact_phone: event.organizer_contact_phone ?? '',
    organizer_website_url: event.organizer_website_url ?? '',
    groom_name: event.groom_name ?? '',
    bride_name: event.bride_name ?? '',
    greetings_text: event.greetings_text ?? '',
    linkedin_url: event.linkedin_url ?? '',
    app_theme_id: event.app_theme_id ?? '',
    cover_images: event.cover_images?.length
      ? event.cover_images
      : event.event_cover_images?.length
        ? event.event_cover_images.map((c) => c.image_url)
        : event.cover_image
          ? [event.cover_image]
          : [],
    e_invite_pdf_url: event.e_invite_pdf_url ?? '',
    start_date: start,
    end_date: end,
    main_venue_id: event.main_venue_id ?? '',
    status: event.status ?? 'draft',
  };
}

function formValuesToPayload(
  values: EventFormValues,
  created_by: string,
  mode: 'create' | 'edit',
  isCorporate: boolean
): CreateEventInput {
  const linkedinUrl = isCorporate ? values.linkedin_url.trim() : '';
  const tid = values.app_theme_id.trim();
  const organizerName = values.organizer_name.trim();
  const organizerLogo = values.organizer_logo_url.trim();
  const organizerEmail = values.organizer_contact_email.trim();
  const organizerPhone = values.organizer_contact_phone.trim();
  const organizerWebsite = values.organizer_website_url.trim();
  const groomName = values.groom_name.trim();
  const brideName = values.bride_name.trim();
  const greetingsText = values.greetings_text.trim();
  const base: CreateEventInput = {
    category_id: values.category_id,
    title: values.title.trim(),
    slug: values.slug.trim(),
    event_code: values.event_code.trim(),
    description: values.description.trim() || undefined,
    organizer_name: organizerName || undefined,
    organizer_logo_url: organizerLogo || undefined,
    organizer_contact_email: organizerEmail || undefined,
    organizer_contact_phone: organizerPhone || undefined,
    organizer_website_url: organizerWebsite || undefined,
    groom_name: groomName || undefined,
    bride_name: brideName || undefined,
    greetings_text: greetingsText || undefined,
    linkedin_url: linkedinUrl || undefined,
    cover_images: values.cover_images,
    e_invite_pdf_url: values.e_invite_pdf_url.trim() || undefined,
    start_date: values.start_date,
    end_date: values.end_date,
    main_venue_id: values.main_venue_id.trim() || undefined,
    status: values.status,
    created_by,
  };
  if (mode === 'edit') {
    return {
      ...base,
      app_theme_id: tid ? tid : null,
      organizer_name: organizerName || null,
      organizer_logo_url: organizerLogo || null,
      organizer_contact_email: organizerEmail || null,
      organizer_contact_phone: organizerPhone || null,
      organizer_website_url: organizerWebsite || null,
      groom_name: groomName || null,
      bride_name: brideName || null,
      greetings_text: greetingsText || null,
      linkedin_url: linkedinUrl || null,
    };
  }
  if (tid) return { ...base, app_theme_id: tid };
  return base;
}

export interface EventFormProps {
  mode: 'create' | 'edit';
  event?: {
    id?: string;
    category_id: string;
    title: string;
    slug: string;
    event_code: string;
    description?: string | null;
    organizer_name?: string | null;
    organizer_logo_url?: string | null;
    organizer_contact_email?: string | null;
    organizer_contact_phone?: string | null;
    organizer_website_url?: string | null;
    groom_name?: string | null;
    bride_name?: string | null;
    greetings_text?: string | null;
    linkedin_url?: string | null;
    app_theme_id?: string | null;
    /** When editing, include so the dropdown can show the label if the list was loaded separately */
    app_themes?: AppThemeOption | null;
    cover_image?: string | null;
    cover_images?: string[] | null;
    e_invite_pdf_url?: string | null;
    post_event_pdf_url?: string | null;
    post_event_pdf_original_name?: string | null;
    post_event_pdf_uploaded_at?: string | null;
    start_date: string;
    end_date: string;
    main_venue_id?: string | null;
    status: string;
  } | null;
  categories: EventCategoryOption[];
  venues: VenueOption[];
  themes: AppThemeOption[];
  onThemeCreated?: (theme: AppThemeOption) => void;
  createdBy: string;
  onSubmit: (payload: CreateEventInput) => void | Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  error?: string | null;
  onPostEventPdfChanged?: (next: { url: string; originalName: string | null; uploadedAt: string | null }) => void;
  postEventReportSettings?: PostEventReportSettings;
  onPostEventReportSettingsChange?: (next: PostEventReportSettings) => void;
}

export function EventForm({
  mode,
  event,
  categories,
  venues,
  themes,
  onThemeCreated,
  createdBy,
  onSubmit,
  onCancel,
  submitLabel,
  cancelLabel = 'Cancel',
  loading = false,
  error: externalError,
  onPostEventPdfChanged,
  postEventReportSettings,
  onPostEventReportSettingsChange,
}: EventFormProps) {
  const [values, setValues] = useState<EventFormValues>(emptyValues());
  const [error, setError] = useState<string | null>(null);
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [themeOptions, setThemeOptions] = useState<AppThemeOption[]>(themes);

  useEffect(() => {
    const list = [...themes];
    const extra = event?.app_themes;
    if (extra?.id && !list.some((x) => x.id === extra.id)) {
      list.push(extra);
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    setThemeOptions(list);
  }, [themes, event?.app_themes]);

  useEffect(() => {
    if (event) setValues(eventToFormValues(event));
    else setValues(emptyValues());
  }, [event, mode]);

  const update = (partial: Partial<EventFormValues>) => {
    setValues((prev) => ({ ...prev, ...partial }));
  };

  // Auto-slug from title in create mode when slug is empty
  useEffect(() => {
    if (mode !== 'create' || !values.title.trim()) return;
    const title = values.title;
    setValues((prev) => {
      if (prev.slug) return prev;
      const slug = title
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      return { ...prev, slug };
    });
  }, [mode, values.title]);

  function getValidationError(): string | null {
    if (!values.category_id) return 'Category is required';
    if (!values.title.trim()) return 'Title is required';
    if (!values.slug.trim()) return 'Slug is required';
    if (!values.event_code.trim()) return 'Event code is required';
    if (!values.start_date) return 'Start date is required';
    if (!values.end_date) return 'End date is required';
    const start = new Date(values.start_date);
    const end = new Date(values.end_date);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 'Invalid dates';
    if (start > end) return 'End date must be on or after start date';
    if (!values.organizer_name?.trim()) return 'Organizer name is required';
    if (!values.organizer_contact_phone?.trim()) return 'Organizer contact number is required';
    if (isWeddingCategory && !values.groom_name?.trim()) return 'Groom name is required for wedding events';
    if (isWeddingCategory && !values.bride_name?.trim()) return 'Bride name is required for wedding events';
    if (isWeddingCategory && !values.greetings_text?.trim()) {
      return 'Greetings text is required for wedding events';
    }
    if (isCorporate) {
      if (!values.linkedin_url.trim()) return 'LinkedIn URL is required for corporate events';
      if (!isLinkedInUrl(values.linkedin_url)) return LINKEDIN_URL_ERROR;
    }
    if (mode === 'create') {
      if (values.cover_images.length === 0) return 'At least one cover image (background image) is required';
      if (!values.main_venue_id?.trim()) return 'Main venue is required';
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const err = getValidationError();
    if (err) {
      setError(err);
      return;
    }
    const payload = formValuesToPayload(values, createdBy, mode, isCorporate);
    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  const displayError = externalError ?? error;
  const submitText = submitLabel ?? (mode === 'create' ? 'Create event' : 'Save changes');
  const selectedTheme = themeOptions.find((t) => t.id === values.app_theme_id);
  const selectedCategory = categories.find((c) => c.id === values.category_id);
  const isWeddingCategory = isWedding(selectedCategory);
  const isCorporate = isCorporateCategory(selectedCategory);

  function handleThemeCreated(theme: AppThemeOption) {
    setThemeOptions((prev) => {
      if (prev.some((t) => t.id === theme.id)) return prev;
      return [...prev, theme].sort((a, b) => a.name.localeCompare(b.name));
    });
    setValues((v) => ({ ...v, app_theme_id: theme.id }));
    onThemeCreated?.(theme);
  }

  return (
    <>
    <form onSubmit={handleSubmit} className={styles.form}>
      {displayError && <p className={styles.error}>{displayError}</p>}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Basic info</div>
        <div className={styles.fieldRow}>
          <div className={styles.field} style={{ flex: '1 1 200px' }}>
            <label className={styles.label}>
              Category <span className={styles.required}>*</span>
            </label>
            <select
              className={styles.select}
              value={values.category_id}
              onChange={(e) => update({ category_id: e.target.value })}
              required
            >
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.fieldRow} style={{ marginTop: '0.5rem' }}>
          <div className={styles.field} style={{ flex: '1 1 100%' }}>
            <label className={styles.label}>
              Title <span className={styles.required}>*</span>
            </label>
            <input
              type="text"
              className={styles.input}
              value={values.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="Event title"
            />
          </div>
        </div>
        <div className={styles.fieldRow} style={{ marginTop: '0.5rem' }}>
          <div className={styles.field}>
            <label className={styles.label}>
              Slug <span className={styles.required}>*</span>
            </label>
            <input
              type="text"
              className={styles.input}
              value={values.slug}
              onChange={(e) => update({ slug: e.target.value })}
              placeholder="event-slug"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>
              Event code <span className={styles.required}>*</span>
            </label>
            <input
              type="text"
              className={styles.input}
              value={values.event_code}
              onChange={(e) => update({ event_code: e.target.value })}
              placeholder="e.g. GL2025"
            />
          </div>
        </div>
        <div style={{ marginTop: '0.5rem' }}>
          <label className={styles.label}>Description</label>
          <textarea
            className={styles.textarea}
            value={values.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="Event description"
            rows={3}
          />
        </div>
        {isWeddingCategory && (
          <>
            <div className={styles.fieldRow} style={{ marginTop: '0.5rem' }}>
              <div className={styles.field}>
                <label className={styles.label}>
                  Groom Name <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  className={styles.input}
                  value={values.groom_name}
                  onChange={(e) => update({ groom_name: e.target.value })}
                  placeholder="Groom name"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>
                  Bride Name <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  className={styles.input}
                  value={values.bride_name}
                  onChange={(e) => update({ bride_name: e.target.value })}
                  placeholder="Bride name"
                />
              </div>
            </div>
            <div style={{ marginTop: '0.5rem' }}>
              <label className={styles.label}>
                Greetings Text <span className={styles.required}>*</span>
              </label>
              <textarea
                className={styles.textarea}
                value={values.greetings_text}
                onChange={(e) => update({ greetings_text: e.target.value })}
                placeholder="Write wedding greetings"
                rows={3}
              />
            </div>
          </>
        )}
        {isCorporate && (
          <div className={styles.fieldRow} style={{ marginTop: '0.5rem' }}>
            <div className={styles.field} style={{ flex: '1 1 100%' }}>
              <label className={styles.label} htmlFor="event-linkedin-url">
                LinkedIn URL <span className={styles.required}>*</span>
              </label>
              <input
                id="event-linkedin-url"
                type="url"
                className={styles.input}
                value={values.linkedin_url}
                onChange={(e) => update({ linkedin_url: e.target.value })}
                placeholder="https://www.linkedin.com/company/your-company"
                maxLength={500}
              />
            </div>
          </div>
        )}
        <div className={styles.sectionTitle} style={{ marginTop: '0.75rem' }}>Organizer</div>
        <div className={styles.fieldRow} style={{ marginTop: '0.5rem' }}>
          <div className={styles.field} style={{ flex: '1 1 100%' }}>
            <label className={styles.label}>
              Organizer Name <span className={styles.required}>*</span>
            </label>
            <input
              type="text"
              className={styles.input}
              value={values.organizer_name}
              onChange={(e) => update({ organizer_name: e.target.value })}
              placeholder="Organizer name"
            />
          </div>
        </div>
        <div className={styles.field} style={{ marginTop: '0.5rem' }}>
          <ImageUploadField
            value={values.organizer_logo_url}
            onChange={(url) => update({ organizer_logo_url: url })}
            label="Organizer Profile (optional)"
            uploadPrefix="events"
          />
        </div>
        <div className={styles.fieldRow} style={{ marginTop: '0.5rem' }}>
          <div className={styles.field}>
            <label className={styles.label}>Organizer Email</label>
            <input
              type="email"
              className={styles.input}
              value={values.organizer_contact_email}
              onChange={(e) => update({ organizer_contact_email: e.target.value })}
              placeholder="organizer@example.com"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>
              Organizer Contact Number <span className={styles.required}>*</span>
            </label>
            <input
              type="text"
              className={styles.input}
              value={values.organizer_contact_phone}
              onChange={(e) => update({ organizer_contact_phone: e.target.value })}
              placeholder="+1 555 123 4567"
            />
          </div>
        </div>
        <div style={{ marginTop: '0.5rem' }}>
          <label className={styles.label}>App theme</label>
          <div className={styles.themeRow}>
            <div className={styles.themeSelectWrap}>
              <select
                className={styles.select}
                value={values.app_theme_id}
                onChange={(e) => update({ app_theme_id: e.target.value })}
              >
                <option value="">No theme</option>
                {themeOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {selectedTheme && (
                <div className={styles.themePreview} aria-hidden>
                  <span
                    className={styles.themeSwatch}
                    style={{ backgroundColor: selectedTheme.primary_color }}
                    title={`Primary ${selectedTheme.primary_color}`}
                  />
                  <span
                    className={styles.themeSwatch}
                    style={{ backgroundColor: selectedTheme.secondary_color }}
                    title={`Secondary ${selectedTheme.secondary_color}`}
                  />
                  <span
                    className={styles.themeSwatch}
                    style={{ backgroundColor: selectedTheme.button_primary_color }}
                    title={`Button primary ${selectedTheme.button_primary_color}`}
                  />
                  <span
                    className={styles.themeSwatch}
                    style={{ backgroundColor: selectedTheme.button_secondary_color }}
                    title={`Button secondary ${selectedTheme.button_secondary_color}`}
                  />
                </div>
              )}
            </div>
            <button
              type="button"
              className={styles.themeAddBtn}
              onClick={() => setThemeModalOpen(true)}
            >
              Add new theme…
            </button>
          </div>
        </div>
        <div className={styles.field} style={{ marginTop: '0.5rem' }}>
          <CoverImagesField
            value={values.cover_images}
            onChange={(urls) => update({ cover_images: urls })}
            label="Cover images (Background images)"
            required={mode === 'create'}
            max={MAX_EVENT_COVER_IMAGES}
            uploadPrefix="events"
          />
        </div>
        <div className={styles.field} style={{ marginTop: '0.75rem' }}>
          <PdfInviteUploadField
            value={values.e_invite_pdf_url}
            onChange={(url) => update({ e_invite_pdf_url: url })}
            label="E-invite (PDF, optional)"
            uploadPrefix="events"
          />
        </div>

        {mode === 'edit' && event?.id && (
          <div className={styles.field} style={{ marginTop: '0.75rem' }}>
            <PostEventPdfUploadField
              eventId={event.id}
              value={event.post_event_pdf_url ?? ''}
              originalName={event.post_event_pdf_original_name ?? null}
              uploadedAt={event.post_event_pdf_uploaded_at ?? null}
              onChange={(next) => onPostEventPdfChanged?.(next)}
              settings={postEventReportSettings}
              onSettingsChange={onPostEventReportSettingsChange}
            />
          </div>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Dates & venue</div>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.label}>
              Start date <span className={styles.required}>*</span>
            </label>
            <input
              type="date"
              className={styles.input}
              value={values.start_date}
              disabled={mode === 'edit'}
              onChange={(e) => {
                const nextStart = e.target.value;
                update({
                  start_date: nextStart,
                  end_date:
                    values.end_date && nextStart && values.end_date < nextStart
                      ? nextStart
                      : values.end_date,
                });
              }}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>
              End date <span className={styles.required}>*</span>
            </label>
            <input
              type="date"
              className={styles.input}
              value={values.end_date}
              disabled={mode === 'edit'}
              onChange={(e) => update({ end_date: e.target.value })}
              min={values.start_date || undefined}
            />
          </div>
        </div>
        <div className={styles.field} style={{ marginTop: '0.5rem' }}>
          <label className={styles.label}>
            Main venue {mode === 'create' && <span className={styles.required}>*</span>}
          </label>
          <select
            className={styles.select}
            value={values.main_venue_id}
            onChange={(e) => update({ main_venue_id: e.target.value })}
            required={mode === 'create'}
          >
            <option value="">{mode === 'create' ? 'Select main venue' : 'No main venue'}</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.actions}>
        <button type="submit" className={styles.btnPrimary} disabled={loading}>
          {loading ? 'Saving…' : submitText}
        </button>
        {onCancel && (
          <button type="button" className={styles.btnSecondary} onClick={onCancel}>
            {cancelLabel}
          </button>
        )}
      </div>
    </form>
    {/* Must not nest inside the event <form> — nested forms are invalid HTML and "Save theme" would submit the parent form */}
    <AppThemeAddModal
      open={themeModalOpen}
      onClose={() => setThemeModalOpen(false)}
      onCreated={handleThemeCreated}
    />
    </>
  );
}
