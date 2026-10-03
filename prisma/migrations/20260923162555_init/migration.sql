/*
  Warnings:

  - A unique constraint covering the columns `[event_id,date]` on the table `event_days` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[event_id,display_order]` on the table `event_highlights` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[title]` on the table `event_offering_master` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[event_id,offering_master_id]` on the table `event_offerings` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[event_id,name]` on the table `event_organizers` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[event_day_id,title]` on the table `event_sessions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[title]` on the table `explore_categories` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[category_id,title]` on the table `explore_items` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `button_primary_color` to the `app_themes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `button_secondary_color` to the `app_themes` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "device_type" AS ENUM ('android', 'ios', 'web');

-- DropIndex
DROP INDEX "idx_event_day_media_media_key";

-- AlterTable
ALTER TABLE "app_configurations" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "app_themes" ADD COLUMN     "button_primary_color" VARCHAR(20) NOT NULL,
ADD COLUMN     "button_secondary_color" VARCHAR(20) NOT NULL;

-- AlterTable
ALTER TABLE "cms_pages" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "comments" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "event_sessions" ADD COLUMN     "venue_subvenue_id" UUID;

-- AlterTable
ALTER TABLE "events_admin" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "post_likes" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "post_media" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "posts" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "venue_contacts" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "venue_facilities" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "venue_photos" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "venues" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- CreateTable
CREATE TABLE "venue_subvenues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "venue_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venue_subvenues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "current_happening" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "bg_image_url" TEXT NOT NULL,
    "happening_date" DATE NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "display_order" INTEGER DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "current_happening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "happening_photos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "happening_id" UUID NOT NULL,
    "image_url" TEXT NOT NULL,
    "media_type" VARCHAR(10) NOT NULL DEFAULT 'image',
    "alt_text" VARCHAR(255),
    "sort_order" INTEGER DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "happening_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "device_type" "device_type" NOT NULL,
    "device_id" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN DEFAULT true,
    "last_seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_venue_subvenues_venue_id" ON "venue_subvenues"("venue_id");

-- CreateIndex
CREATE INDEX "idx_current_happening_active_order" ON "current_happening"("is_active", "display_order", "happening_date" DESC);

-- CreateIndex
CREATE INDEX "idx_current_happening_event_id" ON "current_happening"("event_id");

-- CreateIndex
CREATE INDEX "idx_happening_photos_happening_id" ON "happening_photos"("happening_id", "sort_order");

-- CreateIndex
CREATE INDEX "idx_user_devices_device_type" ON "user_devices"("device_type");

-- CreateIndex
CREATE INDEX "idx_user_devices_user_id" ON "user_devices"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_devices_user_id_device_id_key" ON "user_devices"("user_id", "device_id");

-- CreateIndex
CREATE INDEX "idx_comments_post_id" ON "comments"("post_id");

-- CreateIndex
CREATE INDEX "idx_comments_user_id" ON "comments"("user_id");

-- CreateIndex
CREATE INDEX "idx_event_admins_event_id" ON "event_admins"("event_id");

-- CreateIndex
CREATE INDEX "idx_event_admins_user_id" ON "event_admins"("user_id");

-- CreateIndex
CREATE INDEX "idx_event_categories_created_by" ON "event_categories"("created_by");

-- CreateIndex
CREATE INDEX "idx_event_day_media_event_day_id" ON "event_day_media"("event_day_id");

-- CreateIndex
CREATE INDEX "idx_event_days_event_id" ON "event_days"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_days_event_date_key" ON "event_days"("event_id", "date");

-- CreateIndex
CREATE INDEX "idx_event_explore_items_event_id" ON "event_explore_items"("event_id");

-- CreateIndex
CREATE INDEX "idx_event_guests_event_id" ON "event_guests"("event_id");

-- CreateIndex
CREATE INDEX "idx_event_guests_user_id" ON "event_guests"("user_id");

-- CreateIndex
CREATE INDEX "idx_event_highlights_event_id" ON "event_highlights"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_highlights_event_display_order_key" ON "event_highlights"("event_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "event_offering_master_title_key" ON "event_offering_master"("title");

-- CreateIndex
CREATE INDEX "idx_event_offerings_event_id" ON "event_offerings"("event_id");

-- CreateIndex
CREATE INDEX "idx_event_offerings_offering_master_id" ON "event_offerings"("offering_master_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_offerings_event_master_key" ON "event_offerings"("event_id", "offering_master_id");

-- CreateIndex
CREATE INDEX "idx_event_organizers_event_id" ON "event_organizers"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_organizers_event_name_key" ON "event_organizers"("event_id", "name");

-- CreateIndex
CREATE INDEX "idx_event_sessions_event_day_id" ON "event_sessions"("event_day_id");

-- CreateIndex
CREATE INDEX "idx_event_sessions_venue_id" ON "event_sessions"("venue_id");

-- CreateIndex
CREATE INDEX "idx_event_sessions_venue_subvenue_id" ON "event_sessions"("venue_subvenue_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_sessions_day_title_key" ON "event_sessions"("event_day_id", "title");

-- CreateIndex
CREATE INDEX "idx_events_category_id" ON "events"("category_id");

-- CreateIndex
CREATE INDEX "idx_events_created_by" ON "events"("created_by");

-- CreateIndex
CREATE INDEX "idx_events_main_venue_id" ON "events"("main_venue_id");

-- CreateIndex
CREATE INDEX "idx_events_slug" ON "events"("slug");

-- CreateIndex
CREATE INDEX "idx_events_start_date" ON "events"("start_date");

-- CreateIndex
CREATE INDEX "idx_events_status" ON "events"("status");

-- CreateIndex
CREATE INDEX "idx_events_admin_event_id" ON "events_admin"("event_id");

-- CreateIndex
CREATE INDEX "idx_events_admin_user_id" ON "events_admin"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "explore_categories_title_key" ON "explore_categories"("title");

-- CreateIndex
CREATE INDEX "idx_explore_items_category_id" ON "explore_items"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "explore_items_category_title_key" ON "explore_items"("category_id", "title");

-- CreateIndex
CREATE INDEX "idx_notifications_created_at" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "idx_notifications_is_read" ON "notifications"("is_read");

-- CreateIndex
CREATE INDEX "idx_notifications_recipient_user_id" ON "notifications"("recipient_user_id");

-- CreateIndex
CREATE INDEX "idx_post_likes_post_id" ON "post_likes"("post_id");

-- CreateIndex
CREATE INDEX "idx_post_likes_user_id" ON "post_likes"("user_id");

-- CreateIndex
CREATE INDEX "idx_post_media_post_id" ON "post_media"("post_id");

-- CreateIndex
CREATE INDEX "idx_posts_created_at" ON "posts"("created_at");

-- CreateIndex
CREATE INDEX "idx_posts_user_id" ON "posts"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_otps_user_id" ON "user_otps"("user_id");

-- CreateIndex
CREATE INDEX "idx_users_role_id" ON "users"("role_id");

-- CreateIndex
CREATE INDEX "idx_venue_contacts_venue_id" ON "venue_contacts"("venue_id");

-- CreateIndex
CREATE INDEX "idx_venue_facilities_venue_id" ON "venue_facilities"("venue_id");

-- CreateIndex
CREATE INDEX "idx_venue_photos_venue_id" ON "venue_photos"("venue_id");

-- CreateIndex
CREATE INDEX "idx_venues_city" ON "venues"("city");

-- CreateIndex
CREATE INDEX "idx_venues_country" ON "venues"("country");

-- AddForeignKey
ALTER TABLE "event_sessions" ADD CONSTRAINT "fk_session_venue_subvenue" FOREIGN KEY ("venue_subvenue_id") REFERENCES "venue_subvenues"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "venue_subvenues" ADD CONSTRAINT "venue_subvenues_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "current_happening" ADD CONSTRAINT "current_happening_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "happening_photos" ADD CONSTRAINT "happening_photos_happening_id_fkey" FOREIGN KEY ("happening_id") REFERENCES "current_happening"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "fk_user_devices_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
