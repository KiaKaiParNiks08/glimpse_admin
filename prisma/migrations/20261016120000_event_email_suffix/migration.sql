-- Corporate email-suffix login + faster device lookups for returning installs.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "email_suffix" VARCHAR(150);
CREATE INDEX IF NOT EXISTS "idx_events_email_suffix" ON "events" ("email_suffix");
CREATE INDEX IF NOT EXISTS "idx_user_devices_device_id" ON "user_devices" ("device_id");
