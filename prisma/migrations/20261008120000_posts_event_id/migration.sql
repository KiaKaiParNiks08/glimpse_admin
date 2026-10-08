-- Feed posts belong to one event. Null means the post is not shown in any event feed.
ALTER TABLE "posts" ADD COLUMN "event_id" UUID;

ALTER TABLE "posts"
  ADD CONSTRAINT "posts_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "events"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE INDEX "idx_posts_event_id" ON "posts"("event_id");
