-- Mobile dashboard section settings: custom section title and the event phases the section is shown in.
ALTER TABLE "events"
  ADD COLUMN "current_happening_title" VARCHAR(150),
  ADD COLUMN "current_happening_show_pre_event" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "current_happening_show_ongoing_event" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "current_happening_show_post_event" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "post_event_pdf_title" VARCHAR(200),
  ADD COLUMN "post_event_pdf_show_pre_event" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "post_event_pdf_show_ongoing_event" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "post_event_pdf_show_post_event" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "events"
  ADD CONSTRAINT "events_current_happening_phase_check"
  CHECK ("current_happening_show_pre_event" OR "current_happening_show_ongoing_event" OR "current_happening_show_post_event");

ALTER TABLE "events"
  ADD CONSTRAINT "events_post_event_pdf_phase_check"
  CHECK ("post_event_pdf_show_pre_event" OR "post_event_pdf_show_ongoing_event" OR "post_event_pdf_show_post_event");
