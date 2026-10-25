-- Restore displayable CompareFaces rows and queue scans for existing enrolled guests.
-- Does not delete matches. Does not reset ready face references.

UPDATE media_matches mm
SET match_source = 'uploader_attributed'
FROM media_assets ma
WHERE mm.media_asset_id = ma.id
  AND mm.match_source = 'legacy'
  AND ma.uploaded_by IS NOT NULL
  AND mm.user_id = ma.uploaded_by
  AND mm.similarity >= 0.999;

UPDATE media_matches mm
SET match_source = 'rekognition',
    algorithm_version = COALESCE(mm.algorithm_version, 'rekognition_restored')
WHERE mm.match_source = 'legacy'
  AND mm.similarity >= 0.8
  AND mm.similarity < 0.999;

INSERT INTO user_event_face_scans (
  user_id, event_id, reference_sha256, status, attempt_count, scanned_count, matched_count, updated_at
)
SELECT ufr.user_id, eg.event_id, COALESCE(ufr.content_sha256, ''), 'pending', 0, 0, 0, now()
FROM user_face_references ufr
JOIN event_guests eg ON eg.user_id = ufr.user_id
WHERE ufr.consent = true
  AND ufr.revoked_at IS NULL
  AND ufr.storage_key IS NOT NULL
ON CONFLICT (user_id, event_id) DO NOTHING;
