-- Poster image for a session video. Images leave this null.
ALTER TABLE event_day_media ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE event_day_media ADD COLUMN IF NOT EXISTS thumbnail_key TEXT;
