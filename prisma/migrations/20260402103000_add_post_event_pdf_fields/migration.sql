-- Add post-event PDF metadata to events.
ALTER TABLE "events"
ADD COLUMN "post_event_pdf_url" TEXT,
ADD COLUMN "post_event_pdf_key" TEXT,
ADD COLUMN "post_event_pdf_original_name" VARCHAR(500),
ADD COLUMN "post_event_pdf_size" INTEGER,
ADD COLUMN "post_event_pdf_uploaded_by" UUID,
ADD COLUMN "post_event_pdf_uploaded_at" TIMESTAMPTZ(6);

