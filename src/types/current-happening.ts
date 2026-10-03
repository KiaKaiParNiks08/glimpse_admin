/**
 * Shared types for current happening items (reusable in server and frontend).
 */
export interface CurrentHappeningRow {
  id: string;
  event_id: string;
  title: string;
  description: string | null;
  bg_image_url: string;
  happening_date: Date;
  is_active: boolean | null;
  display_order: number | null;
  happening_photos: HappeningPhotoRow[];
}

export interface HappeningPhotoRow {
  id: string;
  happening_id: string;
  /** Gallery asset URL (image or video). */
  image_url: string;
  media_type: 'image' | 'video';
  alt_text: string | null;
  sort_order: number | null;
}
