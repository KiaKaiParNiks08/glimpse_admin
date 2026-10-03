/**
 * Shared types for event guests (reusable in server and frontend).
 */

export interface EnsureEventGuestParams {
  event_id: string;
  user_id: string;
  venue_contact_id?: string | null;
}
