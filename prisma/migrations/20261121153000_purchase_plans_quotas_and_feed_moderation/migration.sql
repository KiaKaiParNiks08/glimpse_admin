-- Purchase Plans quotas, custom event plans, and feed moderation audit

-- 1. Extend purchase_plans table
ALTER TABLE "purchase_plans"
  ADD COLUMN IF NOT EXISTS "max_event_admins" INTEGER,
  ADD COLUMN IF NOT EXISTS "max_session_media_uploaders" INTEGER,
  ADD COLUMN IF NOT EXISTS "is_custom" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_recommended" BOOLEAN NOT NULL DEFAULT false;

-- 2. Extend events table for custom plan assignment
ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "custom_plan_id" UUID;

CREATE INDEX IF NOT EXISTS "idx_events_custom_plan_id" ON "events"("custom_plan_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_event_custom_plan') THEN
    ALTER TABLE "events"
      ADD CONSTRAINT "fk_event_custom_plan"
      FOREIGN KEY ("custom_plan_id") REFERENCES "purchase_plans"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

-- 3. Extend post_status enum to support 'moderated'
DO $$
BEGIN
  ALTER TYPE "post_status" ADD VALUE IF NOT EXISTS 'moderated';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 4. Create post_moderation_audits table
CREATE TABLE IF NOT EXISTS "post_moderation_audits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "post_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "original_creator_id" UUID NOT NULL,
  "moderator_user_id" UUID NOT NULL,
  "action" VARCHAR(50) NOT NULL,
  "reason" VARCHAR(100) NOT NULL,
  "comment" TEXT,
  "notification_sent" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "post_moderation_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_post_moderation_post_id" ON "post_moderation_audits"("post_id");
CREATE INDEX IF NOT EXISTS "idx_post_moderation_event_id" ON "post_moderation_audits"("event_id");
CREATE INDEX IF NOT EXISTS "idx_post_moderation_moderator" ON "post_moderation_audits"("moderator_user_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_post_moderation_post') THEN
    ALTER TABLE "post_moderation_audits"
      ADD CONSTRAINT "fk_post_moderation_post"
      FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_post_moderation_event') THEN
    ALTER TABLE "post_moderation_audits"
      ADD CONSTRAINT "fk_post_moderation_event"
      FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_post_moderation_creator') THEN
    ALTER TABLE "post_moderation_audits"
      ADD CONSTRAINT "fk_post_moderation_creator"
      FOREIGN KEY ("original_creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_post_moderation_moderator') THEN
    ALTER TABLE "post_moderation_audits"
      ADD CONSTRAINT "fk_post_moderation_moderator"
      FOREIGN KEY ("moderator_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
