-- Gallery media is uploaded per session (event_day_id stays so existing day queries/favorites keep working).
ALTER TABLE "event_day_media" ADD COLUMN "event_session_id" UUID;

ALTER TABLE "event_day_media"
  ADD CONSTRAINT "fk_day_media_session" FOREIGN KEY ("event_session_id")
  REFERENCES "event_sessions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE INDEX "idx_event_day_media_event_session_id" ON "event_day_media"("event_session_id");

-- Existing day-wise media goes to the first session (by start time) of its day.
UPDATE "event_day_media" m
SET "event_session_id" = (
  SELECT s."id" FROM "event_sessions" s
  WHERE s."event_day_id" = m."event_day_id"
  ORDER BY s."start_time" ASC NULLS LAST, s."created_at" ASC, s."id" ASC
  LIMIT 1
)
WHERE m."event_session_id" IS NULL;

-- Watermark shown on top of gallery images (the files themselves are not modified).
ALTER TABLE "events"
  ADD COLUMN "watermark_url" TEXT,
  ADD COLUMN "watermark_position" VARCHAR(20) NOT NULL DEFAULT 'bottom_right',
  ADD COLUMN "watermark_opacity" INTEGER NOT NULL DEFAULT 70;

ALTER TABLE "events"
  ADD CONSTRAINT "events_watermark_position_check"
  CHECK ("watermark_position" IN ('top_left', 'top_right', 'center', 'bottom_left', 'bottom_right'));

ALTER TABLE "events"
  ADD CONSTRAINT "events_watermark_opacity_check"
  CHECK ("watermark_opacity" BETWEEN 0 AND 100);
