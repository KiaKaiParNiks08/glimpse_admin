-- One event planner and one photographer per event.

CREATE TABLE "event_team" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "phone" VARCHAR(30),
    "email" VARCHAR(150),
    "image_url" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_team_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "event_team_role_check" CHECK ("role" IN ('planner', 'photographer'))
);

CREATE UNIQUE INDEX "event_team_event_role_key" ON "event_team"("event_id", "role");
CREATE INDEX "idx_event_team_event_id" ON "event_team"("event_id");

ALTER TABLE "event_team" ADD CONSTRAINT "fk_event_team_event" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
