-- AlterTable
ALTER TABLE "events"
ADD COLUMN IF NOT EXISTS "post_event_pdf_thumbnail_url" TEXT,
ADD COLUMN IF NOT EXISTS "post_event_pdf_thumbnail_key" TEXT;
