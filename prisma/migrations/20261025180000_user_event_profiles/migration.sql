CREATE TABLE IF NOT EXISTS "user_event_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "full_name" VARCHAR(100) NOT NULL DEFAULT '',
    "avatar_url" TEXT,
    "instagram_id" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_event_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_event_profiles_user_event_key"
  ON "user_event_profiles" ("user_id", "event_id");
CREATE INDEX IF NOT EXISTS "idx_user_event_profiles_event_id" ON "user_event_profiles" ("event_id");
CREATE INDEX IF NOT EXISTS "idx_user_event_profiles_user_id" ON "user_event_profiles" ("user_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_event_profiles_event'
  ) THEN
    ALTER TABLE "user_event_profiles"
      ADD CONSTRAINT "fk_user_event_profiles_event"
      FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_event_profiles_user'
  ) THEN
    ALTER TABLE "user_event_profiles"
      ADD CONSTRAINT "fk_user_event_profiles_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;
