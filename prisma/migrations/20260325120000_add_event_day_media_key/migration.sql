-- AlterTable
ALTER TABLE "event_day_media" ADD COLUMN IF NOT EXISTS "media_key" TEXT;

-- Optional index for key lookups / housekeeping
CREATE INDEX IF NOT EXISTS "idx_event_day_media_media_key" ON "event_day_media"("media_key");

