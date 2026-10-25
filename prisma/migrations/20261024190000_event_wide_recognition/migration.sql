-- Event-wide recognition: genuine Rekognition matches only, resumable scans, no uploader attribution.

ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS guest_scan_cursor UUID,
  ADD COLUMN IF NOT EXISTS match_complete BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_storage_key TEXT;

ALTER TABLE media_matches
  ADD COLUMN IF NOT EXISTS match_source VARCHAR(20) NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS algorithm_version VARCHAR(20),
  ADD COLUMN IF NOT EXISTS evidence JSONB,
  ADD COLUMN IF NOT EXISTS reference_sha256 VARCHAR(64);

ALTER TABLE user_face_references
  ADD COLUMN IF NOT EXISTS reference_version INTEGER NOT NULL DEFAULT 1;

-- Uploader was recorded as similarity 1 with no CompareFaces. Keep other legacy rows for audit; my-media ignores them.
UPDATE media_matches mm
SET match_source = 'uploader_attributed'
FROM media_assets ma
WHERE mm.media_asset_id = ma.id
  AND ma.uploaded_by IS NOT NULL
  AND mm.user_id = ma.uploaded_by
  AND mm.similarity >= 0.999
  AND mm.match_source = 'legacy';

DELETE FROM media_matches WHERE match_source = 'uploader_attributed';

DELETE FROM media_matches a
USING media_matches b
WHERE a.media_asset_id = b.media_asset_id
  AND a.user_id = b.user_id
  AND a.ctid < b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS media_matches_asset_user_key ON media_matches (media_asset_id, user_id);
CREATE INDEX IF NOT EXISTS idx_media_matches_source ON media_matches (match_source);

CREATE TABLE IF NOT EXISTS user_event_face_scans (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  reference_sha256 VARCHAR(64) NOT NULL,
  last_asset_created_at TIMESTAMPTZ(6),
  last_asset_id UUID,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  scanned_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, event_id),
  CONSTRAINT user_event_face_scans_status_check CHECK (status IN ('pending', 'processing', 'complete', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_user_event_face_scans_queue
  ON user_event_face_scans (status, next_retry_at, updated_at);

INSERT INTO user_event_face_scans (user_id, event_id, reference_sha256, status)
SELECT ufr.user_id, eg.event_id, COALESCE(ufr.content_sha256, ''), 'pending'
FROM user_face_references ufr
JOIN event_guests eg ON eg.user_id = ufr.user_id
WHERE ufr.consent = true
  AND ufr.revoked_at IS NULL
  AND ufr.storage_key IS NOT NULL
ON CONFLICT (user_id, event_id) DO NOTHING;

-- Reprocess every asset so graphics/uploader rows are replaced by DetectFaces + CompareFaces.
UPDATE media_assets
SET processing_status = 'pending',
    match_complete = false,
    guest_scan_cursor = NULL,
    attempt_count = 0,
    last_error = NULL,
    next_retry_at = NULL,
    updated_at = now();
