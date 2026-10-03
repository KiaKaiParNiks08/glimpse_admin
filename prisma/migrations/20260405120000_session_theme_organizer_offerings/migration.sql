-- AlterTable
ALTER TABLE "event_sessions" ADD COLUMN IF NOT EXISTS "event_organizer_id" UUID;
ALTER TABLE "event_sessions" ADD COLUMN IF NOT EXISTS "session_theme" VARCHAR(200);

-- CreateTable
CREATE TABLE IF NOT EXISTS "event_session_offerings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_session_id" UUID NOT NULL,
    "offering_master_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_session_offerings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_session_offerings_session_master_key" ON "event_session_offerings"("event_session_id", "offering_master_id");
CREATE INDEX IF NOT EXISTS "idx_event_session_offerings_session_id" ON "event_session_offerings"("event_session_id");
CREATE INDEX IF NOT EXISTS "idx_event_session_offerings_master_id" ON "event_session_offerings"("offering_master_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_organizer') THEN
    ALTER TABLE "event_sessions" ADD CONSTRAINT "fk_session_organizer" FOREIGN KEY ("event_organizer_id") REFERENCES "event_organizers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_offering_session') THEN
    ALTER TABLE "event_session_offerings" ADD CONSTRAINT "fk_session_offering_session" FOREIGN KEY ("event_session_id") REFERENCES "event_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_offering_master') THEN
    ALTER TABLE "event_session_offerings" ADD CONSTRAINT "fk_session_offering_master" FOREIGN KEY ("offering_master_id") REFERENCES "event_offering_master"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_event_sessions_event_organizer_id" ON "event_sessions"("event_organizer_id");
