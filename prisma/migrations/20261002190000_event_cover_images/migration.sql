-- Several cover images per event, in the order set by the admin. events.cover_image keeps the first one.
CREATE TABLE "event_cover_images" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" UUID NOT NULL,
  "image_url" TEXT NOT NULL,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_cover_images_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_event_cover_images_event_order" ON "event_cover_images"("event_id", "display_order");

ALTER TABLE "event_cover_images"
  ADD CONSTRAINT "fk_event_cover_images_event" FOREIGN KEY ("event_id")
  REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Existing single cover image becomes the first (only) cover image.
INSERT INTO "event_cover_images" ("event_id", "image_url", "display_order")
SELECT "id", "cover_image", 0 FROM "events"
WHERE "cover_image" IS NOT NULL AND btrim("cover_image") <> '';
