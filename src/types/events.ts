/**
 * Shared types for events (reusable in server and frontend).
 */

export interface EventByCodeResult {
  id: string;
  main_venue_id: string | null;
}

/** Category snippet included in event details */
export interface EventDetailsCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon_url: string | null;
  banner_url: string | null;
}

/** Venue snippet included in event details */
export interface EventDetailsVenue {
  id: string;
  name: string;
  address: string;
  description: string | null;
  bg_image_url: string | null;
  city: string | null;
  state_name: string | null;
  country: string | null;
  postal_code: string | null;
}

/** Day media item in event details */
export interface EventDetailsDayMedia {
  id: string;
  event_session_id: string | null;
  media_key?: string | null;
  media_url: string;
  media_type: string;
  display_order: number | null;
}

/** Session venue snippet */
export interface EventDetailsSessionVenue {
  id: string;
  name: string;
  address: string;
  latitude: string | number | null;
  longitude: string | number | null;
  city: string | null;
  state_name: string | null;
  country: string | null;
}

/** Sub-venue linked to a session (when session is scoped to an area under the parent venue) */
export interface EventDetailsSessionSubvenue {
  id: string;
  title: string;
}

/** Session in event details */
export interface EventDetailsSession {
  id: string;
  event_day_id: string;
  title: string;
  description: string | null;
  event_organizer_id: string | null;
  session_theme: string | null;
  start_time: Date | null;
  end_time: Date | null;
  venue_id: string | null;
  venue_subvenue_id: string | null;
  status: string | null;
  event_session_bg_url: string | null;
  venues: EventDetailsSessionVenue | null;
  venue_subvenues: EventDetailsSessionSubvenue | null;
  event_organizers: { id: string; name: string } | null;
  event_session_offerings: { offering_master_id: string }[];
}

/** Event day in event details */
export interface EventDetailsDay {
  id: string;
  event_id: string;
  title: string | null;
  date: Date;
  event_day_media: EventDetailsDayMedia[];
  event_sessions: EventDetailsSession[];
}

/** Organizer in event details */
export interface EventDetailsOrganizer {
  id: string;
  name: string;
  logo_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
}

/** Offering master – exposed directly in event_offerings array */
export interface EventDetailsOfferingMaster {
  id: string;
  title: string;
  description: string | null;
}

/** App theme colors from master table (when event has app_theme_id) */
export interface EventDetailsAppTheme {
  id: string;
  name: string;
  primary_color: string;
  secondary_color: string;
}

/** Full event details returned by getEventDetailsById */
export interface EventDetailsResult {
  id: string;
  category_id: string;
  title: string;
  slug: string;
  event_code: string;
  description: string | null;
  groom_name: string | null;
  bride_name: string | null;
  greetings_text: string | null;
  /** Legacy display label; also mirrored from app_themes.name when linked */
  theme: string | null;
  app_theme_id: string | null;
  app_themes: EventDetailsAppTheme | null;
  cover_image: string | null;
  e_invite_pdf_url: string | null;
  start_date: Date;
  end_date: Date;
  main_venue_id: string | null;
  status: string;
  created_by: string;
  event_categories: EventDetailsCategory;
  venues: EventDetailsVenue | null;
  event_organizers: EventDetailsOrganizer[];
  event_offerings: EventDetailsOfferingMaster[];
}
