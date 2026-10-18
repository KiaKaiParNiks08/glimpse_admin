-- Guests who may upload gallery media for a session (mobile and/or email).
CREATE TABLE IF NOT EXISTS "event_session_uploaders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_session_id" UUID NOT NULL,
  "mobile_number" VARCHAR(20),
  "country_code" VARCHAR(20),
  "email" VARCHAR(150),
  "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_session_uploaders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_session_uploaders_contact_chk" CHECK (
    "mobile_number" IS NOT NULL OR "email" IS NOT NULL
  )
);

ALTER TABLE "event_session_uploaders"
  ADD CONSTRAINT "fk_session_uploader_session"
  FOREIGN KEY ("event_session_id") REFERENCES "event_sessions"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS "idx_event_session_uploaders_session_id"
  ON "event_session_uploaders" ("event_session_id");

CREATE UNIQUE INDEX IF NOT EXISTS "event_session_uploaders_session_mobile_key"
  ON "event_session_uploaders" ("event_session_id", "mobile_number")
  WHERE "mobile_number" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "event_session_uploaders_session_email_key"
  ON "event_session_uploaders" ("event_session_id", lower("email"))
  WHERE "email" IS NOT NULL;
