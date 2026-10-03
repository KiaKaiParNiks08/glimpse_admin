/**
 * Shared types for event highlights (reusable in server and frontend).
 */

export interface EventHighlightRow {
  id: string;
  event_id: string;
  title: string;
  description: string | null;
  media_url: string | null;
  media_type: string | null;
  display_order: number | null;
}
