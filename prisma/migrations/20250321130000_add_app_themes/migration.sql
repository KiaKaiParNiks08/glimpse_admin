-- CreateTable
CREATE TABLE "app_themes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(150) NOT NULL,
    "primary_color" VARCHAR(20) NOT NULL,
    "secondary_color" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_themes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_app_themes_name" ON "app_themes"("name");

-- AlterTable
ALTER TABLE "events" ADD COLUMN "app_theme_id" UUID;

-- CreateIndex
CREATE INDEX "idx_events_app_theme_id" ON "events"("app_theme_id");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "fk_event_app_theme" FOREIGN KEY ("app_theme_id") REFERENCES "app_themes"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
