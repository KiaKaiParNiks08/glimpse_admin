import prisma from '@/server/prisma';

let ensured = false;

/**
 * Create people-in-media tables if the pgvector migration never applied on the host.
 * Embeddings use vector(128) when the extension exists, otherwise jsonb.
 */
export async function ensurePeopleMediaSchema(): Promise<void> {
  if (ensured) return;
  const existing = await prisma.$queryRaw<{ name: string | null }[]>`
    SELECT to_regclass('public.media_matches')::text AS name
  `;
  if (existing[0]?.name) {
    await ensureRecognitionV2Columns();
    ensured = true;
    return;
  }
  await prisma.$executeRawUnsafe(`
    DO $ensure$
    BEGIN
      -- Do not CREATE EXTENSION vector here. On hosted Postgres that lock can hang a GET for minutes.

      CREATE TABLE IF NOT EXISTS media_assets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        source VARCHAR(20) NOT NULL,
        media_type media_type NOT NULL,
        storage_key TEXT NOT NULL,
        media_url TEXT NOT NULL,
        content_sha256 VARCHAR(64) NOT NULL,
        idempotency_key VARCHAR(120),
        event_day_media_id UUID UNIQUE REFERENCES event_day_media(id) ON DELETE CASCADE,
        post_media_id UUID UNIQUE REFERENCES post_media(id) ON DELETE CASCADE,
        uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
        processing_status VARCHAR(20) NOT NULL DEFAULT 'pending',
        face_count INTEGER NOT NULL DEFAULT 0,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        processed_at TIMESTAMPTZ(6),
        next_retry_at TIMESTAMPTZ(6),
        created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT media_assets_source_check CHECK (source IN ('photographer', 'user_post')),
        CONSTRAINT media_assets_status_check CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS media_assets_event_hash_key ON media_assets (event_id, content_sha256);
      CREATE UNIQUE INDEX IF NOT EXISTS media_assets_event_idempotency_key ON media_assets (event_id, idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_media_assets_event_status ON media_assets (event_id, processing_status);
      CREATE INDEX IF NOT EXISTS idx_media_assets_queue ON media_assets (processing_status, next_retry_at);

      IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'media_faces') THEN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
          EXECUTE $v$
            CREATE TABLE media_faces (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
              face_index INTEGER NOT NULL,
              confidence DOUBLE PRECISION NOT NULL,
              box JSONB NOT NULL,
              embedding vector(128) NOT NULL,
              created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP
            )
          $v$;
        ELSE
          EXECUTE $j$
            CREATE TABLE media_faces (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
              face_index INTEGER NOT NULL,
              confidence DOUBLE PRECISION NOT NULL,
              box JSONB NOT NULL,
              embedding JSONB NOT NULL DEFAULT '[]'::jsonb,
              created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP
            )
          $j$;
        END IF;
        CREATE UNIQUE INDEX media_faces_asset_index_key ON media_faces (media_asset_id, face_index);
        CREATE INDEX idx_media_faces_asset ON media_faces (media_asset_id);
      END IF;

      IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_face_references') THEN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
          EXECUTE $v$
            CREATE TABLE user_face_references (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
              consent BOOLEAN NOT NULL DEFAULT false,
              consent_version VARCHAR(20) NOT NULL DEFAULT 'v1',
              consented_at TIMESTAMPTZ(6),
              revoked_at TIMESTAMPTZ(6),
              storage_key TEXT,
              content_sha256 VARCHAR(64),
              processing_status VARCHAR(20) NOT NULL DEFAULT 'pending',
              attempt_count INTEGER NOT NULL DEFAULT 0,
              last_error TEXT,
              next_retry_at TIMESTAMPTZ(6),
              embedding vector(128),
              created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
              CONSTRAINT user_face_references_status_check CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed', 'revoked'))
            )
          $v$;
        ELSE
          EXECUTE $j$
            CREATE TABLE user_face_references (
              id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
              user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
              consent BOOLEAN NOT NULL DEFAULT false,
              consent_version VARCHAR(20) NOT NULL DEFAULT 'v1',
              consented_at TIMESTAMPTZ(6),
              revoked_at TIMESTAMPTZ(6),
              storage_key TEXT,
              content_sha256 VARCHAR(64),
              processing_status VARCHAR(20) NOT NULL DEFAULT 'pending',
              attempt_count INTEGER NOT NULL DEFAULT 0,
              last_error TEXT,
              next_retry_at TIMESTAMPTZ(6),
              embedding JSONB,
              created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
              CONSTRAINT user_face_references_status_check CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed', 'revoked'))
            )
          $j$;
        END IF;
        CREATE INDEX idx_user_face_references_queue ON user_face_references (processing_status, next_retry_at);
      END IF;

      CREATE TABLE IF NOT EXISTS media_matches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
        media_face_id UUID NOT NULL REFERENCES media_faces(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        similarity DOUBLE PRECISION NOT NULL,
        created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS media_matches_face_user_key ON media_matches (media_face_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_media_matches_user_asset ON media_matches (user_id, media_asset_id);
      CREATE INDEX IF NOT EXISTS idx_media_matches_asset ON media_matches (media_asset_id);
    END
    $ensure$;
  `);
  await ensureRecognitionV2Columns();
  ensured = true;
}

async function ensureRecognitionV2Columns(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE media_assets
      ADD COLUMN IF NOT EXISTS guest_scan_cursor UUID,
      ADD COLUMN IF NOT EXISTS match_complete BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
      ADD COLUMN IF NOT EXISTS thumbnail_storage_key TEXT;
    ALTER TABLE media_matches
      ADD COLUMN IF NOT EXISTS match_source VARCHAR(20) NOT NULL DEFAULT 'legacy',
      ADD COLUMN IF NOT EXISTS algorithm_version VARCHAR(20),
      ADD COLUMN IF NOT EXISTS evidence JSONB,
      ADD COLUMN IF NOT EXISTS reference_sha256 VARCHAR(64);
    ALTER TABLE user_face_references
      ADD COLUMN IF NOT EXISTS reference_version INTEGER NOT NULL DEFAULT 1;
    DELETE FROM media_matches a
    USING media_matches b
    WHERE a.media_asset_id = b.media_asset_id
      AND a.user_id = b.user_id
      AND a.ctid < b.ctid;
    CREATE UNIQUE INDEX IF NOT EXISTS media_matches_asset_user_key ON media_matches (media_asset_id, user_id);
    CREATE TABLE IF NOT EXISTS user_event_face_scans (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      reference_sha256 VARCHAR(64) NOT NULL,
      last_asset_created_at TIMESTAMPTZ(6),
      last_asset_id UUID,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      scanned_count INTEGER NOT NULL DEFAULT 0,
      matched_count INTEGER NOT NULL DEFAULT 0,
      next_retry_at TIMESTAMPTZ(6),
      created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, event_id)
    );
  `);
}
