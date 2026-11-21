-- 1. Add event_id column to notifications (nullable initially for backfill)
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "event_id" UUID;

-- 2. Backfill event_id for existing notifications rows
-- From reference_type = 'event'
UPDATE "notifications"
SET "event_id" = "reference_id"
WHERE "event_id" IS NULL AND "reference_type" = 'event' AND "reference_id" IS NOT NULL;

-- From reference_type = 'session'
UPDATE "notifications" n
SET "event_id" = ed.event_id
FROM "event_sessions" es
JOIN "event_days" ed ON ed.id = es.event_day_id
WHERE n.event_id IS NULL AND n.reference_type = 'session' AND n.reference_id = es.id;

-- From reference_type IN ('post', 'spotlight', 'recognized_post')
UPDATE "notifications" n
SET "event_id" = p.event_id
FROM "posts" p
WHERE n.event_id IS NULL AND n.reference_type IN ('post', 'spotlight', 'recognized_post') AND n.reference_id = p.id;

-- From reference_type IN ('comment', 'reply')
UPDATE "notifications" n
SET "event_id" = p.event_id
FROM "comments" c
JOIN "posts" p ON p.id = c.post_id
WHERE n.event_id IS NULL AND n.reference_type IN ('comment', 'reply') AND n.reference_id = c.id;

-- Fallback for any remaining rows: recipient's most recently joined event
UPDATE "notifications" n
SET "event_id" = (
  SELECT eg.event_id
  FROM "event_guests" eg
  WHERE eg.user_id = n.recipient_user_id
  ORDER BY eg.joined_at DESC NULLS LAST
  LIMIT 1
)
WHERE n.event_id IS NULL;

-- Fallback for any orphan rows: latest created event in system
UPDATE "notifications" n
SET "event_id" = (
  SELECT id FROM "events" ORDER BY created_at DESC LIMIT 1
)
WHERE n.event_id IS NULL;

-- Delete any legacy notifications that still could not be linked to an event
DELETE FROM "notifications" WHERE "event_id" IS NULL;

-- 3. Set NOT NULL and foreign key constraint
ALTER TABLE "notifications" ALTER COLUMN "event_id" SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_notifications_event'
  ) THEN
    ALTER TABLE "notifications"
      ADD CONSTRAINT "fk_notifications_event"
      FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

-- 4. Create composite indexes for fast event-scoped lookups and unread counts
CREATE INDEX IF NOT EXISTS "idx_notifications_user_event_read"
  ON "notifications" ("recipient_user_id", "event_id", "is_read");

CREATE INDEX IF NOT EXISTS "idx_notifications_user_event_feed"
  ON "notifications" ("recipient_user_id", "event_id", "is_deleted", "created_at" DESC);
