-- People in media: event-linked assets, face embeddings (pgvector), consented references, matches.
-- Embeddings are server-only. API queries must not select these columns.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "media_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "media_type" "media_type" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "media_url" TEXT NOT NULL,
    "content_sha256" VARCHAR(64) NOT NULL,
    "idempotency_key" VARCHAR(120),
    "event_day_media_id" UUID,
    "post_media_id" UUID,
    "uploaded_by" UUID,
    "processing_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "face_count" INTEGER NOT NULL DEFAULT 0,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "processed_at" TIMESTAMPTZ(6),
    "next_retry_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "media_assets_source_check" CHECK ("source" IN ('photographer', 'user_post')),
    CONSTRAINT "media_assets_status_check" CHECK ("processing_status" IN ('pending', 'processing', 'ready', 'failed'))
);

CREATE UNIQUE INDEX "media_assets_event_day_media_id_key" ON "media_assets"("event_day_media_id");
CREATE UNIQUE INDEX "media_assets_post_media_id_key" ON "media_assets"("post_media_id");
CREATE UNIQUE INDEX "media_assets_event_hash_key" ON "media_assets"("event_id", "content_sha256");
CREATE UNIQUE INDEX "media_assets_event_idempotency_key" ON "media_assets"("event_id", "idempotency_key");
CREATE INDEX "idx_media_assets_event_status" ON "media_assets"("event_id", "processing_status");
CREATE INDEX "idx_media_assets_queue" ON "media_assets"("processing_status", "next_retry_at");

ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_event_day_media_id_fkey" FOREIGN KEY ("event_day_media_id") REFERENCES "event_day_media"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_post_media_id_fkey" FOREIGN KEY ("post_media_id") REFERENCES "post_media"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE TABLE "media_faces" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "media_asset_id" UUID NOT NULL,
    "face_index" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "box" JSONB NOT NULL,
    "embedding" vector(128) NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_faces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "media_faces_asset_index_key" ON "media_faces"("media_asset_id", "face_index");
CREATE INDEX "idx_media_faces_asset" ON "media_faces"("media_asset_id");
CREATE INDEX "idx_media_faces_embedding" ON "media_faces" USING hnsw ("embedding" vector_cosine_ops);

ALTER TABLE "media_faces" ADD CONSTRAINT "media_faces_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE TABLE "user_face_references" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "consent_version" VARCHAR(20) NOT NULL DEFAULT 'v1',
    "consented_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "storage_key" TEXT,
    "content_sha256" VARCHAR(64),
    "processing_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_retry_at" TIMESTAMPTZ(6),
    "embedding" vector(128),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_face_references_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_face_references_status_check" CHECK ("processing_status" IN ('pending', 'processing', 'ready', 'failed', 'revoked'))
);

CREATE UNIQUE INDEX "user_face_references_user_id_key" ON "user_face_references"("user_id");
CREATE INDEX "idx_user_face_references_queue" ON "user_face_references"("processing_status", "next_retry_at");
CREATE INDEX "idx_user_face_references_embedding" ON "user_face_references" USING hnsw ("embedding" vector_cosine_ops);

ALTER TABLE "user_face_references" ADD CONSTRAINT "user_face_references_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE TABLE "media_matches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "media_asset_id" UUID NOT NULL,
    "media_face_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_matches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "media_matches_face_user_key" ON "media_matches"("media_face_id", "user_id");
CREATE INDEX "idx_media_matches_user_asset" ON "media_matches"("user_id", "media_asset_id");
CREATE INDEX "idx_media_matches_asset" ON "media_matches"("media_asset_id");

ALTER TABLE "media_matches" ADD CONSTRAINT "media_matches_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "media_matches" ADD CONSTRAINT "media_matches_media_face_id_fkey" FOREIGN KEY ("media_face_id") REFERENCES "media_faces"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "media_matches" ADD CONSTRAINT "media_matches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
