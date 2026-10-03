-- CreateTable
CREATE TABLE "user_favorites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "item_type" VARCHAR(20) NOT NULL,
    "event_day_media_id" UUID,
    "post_id" UUID,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_favorites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_favorites_target_check" CHECK (
        ("item_type" = 'day_media' AND "event_day_media_id" IS NOT NULL AND "post_id" IS NULL)
        OR ("item_type" = 'post' AND "post_id" IS NOT NULL AND "event_day_media_id" IS NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "unique_user_favorite_day_media" ON "user_favorites"("user_id", "event_id", "event_day_media_id");
CREATE UNIQUE INDEX "unique_user_favorite_post" ON "user_favorites"("user_id", "event_id", "post_id");
CREATE INDEX "idx_user_favorites_user_event_created" ON "user_favorites"("user_id", "event_id", "created_at" DESC);
CREATE INDEX "idx_user_favorites_day_media" ON "user_favorites"("event_day_media_id");
CREATE INDEX "idx_user_favorites_post" ON "user_favorites"("post_id");

-- AddForeignKey
ALTER TABLE "user_favorites" ADD CONSTRAINT "fk_user_favorites_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "user_favorites" ADD CONSTRAINT "fk_user_favorites_event" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "user_favorites" ADD CONSTRAINT "fk_user_favorites_day_media" FOREIGN KEY ("event_day_media_id") REFERENCES "event_day_media"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "user_favorites" ADD CONSTRAINT "fk_user_favorites_post" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
