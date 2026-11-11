-- Add optional LinkedIn profile URL to users and event-scoped user profiles
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "linkedin_url" VARCHAR(500);

ALTER TABLE "user_event_profiles"
  ADD COLUMN IF NOT EXISTS "linkedin_url" VARCHAR(500);

-- One-time backfill for corporate users who previously saved LinkedIn URLs into instagram_id
UPDATE "users"
SET
  "linkedin_url" = BTRIM("instagram_id"),
  "instagram_id" = NULL
WHERE ("linkedin_url" IS NULL OR BTRIM("linkedin_url") = '')
  AND "instagram_id" IS NOT NULL
  AND "instagram_id" ~* 'linkedin\.com';

UPDATE "user_event_profiles"
SET
  "linkedin_url" = BTRIM("instagram_id"),
  "instagram_id" = NULL
WHERE ("linkedin_url" IS NULL OR BTRIM("linkedin_url") = '')
  AND "instagram_id" IS NOT NULL
  AND "instagram_id" ~* 'linkedin\.com';
