-- Watermark is drawn as a square of watermark_size x watermark_size pixels of the actual image (max 120).
ALTER TABLE "events" ADD COLUMN "watermark_size" INTEGER NOT NULL DEFAULT 48;

ALTER TABLE "events"
  ADD CONSTRAINT "events_watermark_size_check"
  CHECK ("watermark_size" BETWEEN 16 AND 120);
