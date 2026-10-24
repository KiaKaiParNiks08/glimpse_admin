-- Sessions created on the media page stay off the event edit form.
ALTER TABLE event_sessions ADD COLUMN IF NOT EXISTS media_panel_only BOOLEAN NOT NULL DEFAULT false;

-- A guest can be allowed on every session of an event, or on specific sessions.
ALTER TABLE event_session_uploaders ADD COLUMN IF NOT EXISTS event_id UUID;
ALTER TABLE event_session_uploaders ADD COLUMN IF NOT EXISTS all_sessions BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE event_session_uploaders ALTER COLUMN event_session_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_uploader_event'
  ) THEN
    ALTER TABLE event_session_uploaders
      ADD CONSTRAINT fk_session_uploader_event
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_event_session_uploaders_event_id
  ON event_session_uploaders (event_id);
