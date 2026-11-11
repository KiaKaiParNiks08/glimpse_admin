-- Composite indexes to speed up mobile feed, gallery pagination, comments, notifications, and chunked uploads
CREATE INDEX IF NOT EXISTS "idx_posts_event_status_created"
  ON "posts" ("event_id", "status", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_notifications_recipient_feed"
  ON "notifications" ("recipient_user_id", "is_deleted", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_event_day_media_session_order"
  ON "event_day_media" ("event_session_id", "display_order");

CREATE INDEX IF NOT EXISTS "idx_comments_post_parent_status"
  ON "comments" ("post_id", "parent_comment_id", "status", "created_at");

CREATE TABLE IF NOT EXISTS "upload_sessions" (
  "id" TEXT PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "filename" TEXT NOT NULL,
  "file_size" BIGINT NOT NULL,
  "content_type" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "meta" JSONB,
  "chunk_size" INTEGER NOT NULL DEFAULT 2097152,
  "total_chunks" INTEGER NOT NULL,
  "received_bytes" BIGINT NOT NULL DEFAULT 0,
  "next_chunk_index" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "final_media_url" TEXT,
  "final_storage_key" TEXT,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_upload_sessions_user_event" ON "upload_sessions" ("user_id", "event_id");

CREATE TABLE IF NOT EXISTS "upload_session_chunks" (
  "upload_id" TEXT NOT NULL,
  "chunk_index" INTEGER NOT NULL,
  "byte_length" INTEGER NOT NULL,
  "storage_key" TEXT,
  "chunk_data" BYTEA,
  "created_at" TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY ("upload_id", "chunk_index")
);
