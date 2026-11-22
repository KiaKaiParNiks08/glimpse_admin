/**
 * Media & Face Recognition Backfill Script
 * 
 * Safely registers unindexed gallery media and feed posts into `media_assets`
 * and ensures `user_event_face_scans` are populated for enrolled event guests.
 * 
 * Usage:
 *   node --experimental-strip-types scripts/backfill-recognition.ts            # Dry-run across all events
 *   node --experimental-strip-types scripts/backfill-recognition.ts --apply   # Apply backfill
 *   node --experimental-strip-types scripts/backfill-recognition.ts --event-id=<uuid> --apply
 */

import 'dotenv/config';
import crypto from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[backfill] DATABASE_URL is not set.');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function storageKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed, 'https://dummy.local');
    const key = parsed.searchParams.get('key') || parsed.pathname.replace(/^\/+/, '');
    return key || null;
  } catch {
    return trimmed;
  }
}

async function ensureSchema(): Promise<void> {
  const existing = await prisma.$queryRaw<{ name: string | null }[]>`
    SELECT to_regclass('public.media_assets')::text AS name
  `;
  if (existing[0]?.name) return;

  await prisma.$executeRawUnsafe(`
    DO $ensure$
    BEGIN
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
        guest_scan_cursor UUID,
        match_complete BOOLEAN NOT NULL DEFAULT false,
        thumbnail_url TEXT,
        thumbnail_storage_key TEXT,
        CONSTRAINT media_assets_source_check CHECK (source IN ('photographer', 'user_post')),
        CONSTRAINT media_assets_status_check CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed'))
      );
      CREATE UNIQUE INDEX IF NOT EXISTS media_assets_event_hash_key ON media_assets (event_id, content_sha256);
      CREATE UNIQUE INDEX IF NOT EXISTS media_assets_event_idempotency_key ON media_assets (event_id, idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_media_assets_event_status ON media_assets (event_id, processing_status);
      CREATE INDEX IF NOT EXISTS idx_media_assets_queue ON media_assets (processing_status, next_retry_at);

      CREATE TABLE IF NOT EXISTS media_faces (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
        face_index INTEGER NOT NULL,
        confidence DOUBLE PRECISION NOT NULL,
        box JSONB NOT NULL,
        embedding JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS media_faces_asset_index_key ON media_faces (media_asset_id, face_index);

      CREATE TABLE IF NOT EXISTS user_face_references (
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
        reference_version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT user_face_references_status_check CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed', 'revoked'))
      );

      CREATE TABLE IF NOT EXISTS media_matches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
        media_face_id UUID NOT NULL REFERENCES media_faces(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        similarity DOUBLE PRECISION NOT NULL,
        match_source VARCHAR(20) NOT NULL DEFAULT 'legacy',
        algorithm_version VARCHAR(20),
        evidence JSONB,
        reference_sha256 VARCHAR(64),
        created_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP
      );
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

      CREATE TABLE IF NOT EXISTS media_asset_user_checks (
        media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reference_sha256 VARCHAR(64),
        checked_at TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (media_asset_id, user_id)
      );
    END
    $ensure$;
  `);
}

async function main() {
  const isApply = process.argv.includes('--apply');
  const eventIdArg = process.argv.find((a) => a.startsWith('--event-id='))?.split('=')[1];

  console.log('='.repeat(70));
  console.log(`GLIMPSE MEDIA & RECOGNITION BACKFILL (${isApply ? 'APPLY MODE' : 'DRY RUN MODE'})`);
  console.log('='.repeat(70));

  await ensureSchema();

  let events: { id: string; title: string | null }[] = [];
  if (eventIdArg) {
    const ev = await prisma.events.findUnique({
      where: { id: eventIdArg },
      select: { id: true, title: true },
    });
    if (!ev) {
      console.error(`[backfill] Event not found: ${eventIdArg}`);
      process.exit(1);
    }
    events = [ev];
  } else {
    events = await prisma.events.findMany({
      select: { id: true, title: true },
      orderBy: { created_at: 'desc' },
    });
  }

  console.log(`\nEvaluating ${events.length} event(s)...\n`);

  let totalUnindexedFeed = 0;
  let totalUnindexedGallery = 0;
  let totalScansNeeded = 0;
  let totalRegistered = 0;
  let totalScansCreated = 0;

  for (const event of events) {
    const eventId = event.id;

    // 1. Unindexed active feed posts
    const feedRows = await prisma.$queryRaw<
      { id: string; media_type: string; media_url: string; thumbnail_url: string | null; user_id: string }[]
    >`
      SELECT pm.id, pm.media_type::text AS media_type, pm.media_url, pm.thumbnail_url, p.user_id
      FROM post_media pm
      JOIN posts p ON p.id = pm.post_id
      LEFT JOIN media_assets ma ON ma.post_media_id = pm.id
      WHERE p.event_id = ${eventId}::uuid
        AND p.status = 'active'
        AND pm.media_type IN ('image', 'video')
        AND ma.id IS NULL
    `;
    const feedCount = feedRows.length;

    // 2. Unindexed gallery session media
    const galleryRows = await prisma.$queryRaw<
      {
        id: string;
        media_type: string;
        media_url: string;
        media_key: string | null;
        thumbnail_url: string | null;
        thumbnail_key: string | null;
        uploaded_by: string | null;
      }[]
    >`
      SELECT edm.id, edm.media_type, edm.media_url, edm.media_key,
             edm.thumbnail_url, edm.thumbnail_key, edm.uploaded_by
      FROM event_day_media edm
      JOIN event_days ed ON ed.id = edm.event_day_id
      LEFT JOIN media_assets ma ON ma.event_day_media_id = edm.id
      WHERE ed.event_id = ${eventId}::uuid
        AND edm.media_type IN ('image', 'video')
        AND ma.id IS NULL
    `;
    const galleryCount = galleryRows.length;

    // 3. Enrolled users missing event scan rows
    const enrolledUsers = await prisma.$queryRaw<{ user_id: string; content_sha256: string }[]>`
      SELECT ufr.user_id, ufr.content_sha256
      FROM user_face_references ufr
      WHERE ufr.consent = true
        AND ufr.revoked_at IS NULL
        AND ufr.storage_key IS NOT NULL
        AND ufr.user_id IN (
          SELECT user_id FROM event_guests WHERE event_id = ${eventId}::uuid
          UNION
          SELECT user_id FROM posts WHERE event_id = ${eventId}::uuid AND event_id IS NOT NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM user_event_face_scans fs
          WHERE fs.event_id = ${eventId}::uuid
            AND fs.user_id = ufr.user_id
            AND fs.reference_sha256 IS NOT DISTINCT FROM ufr.content_sha256
            AND fs.status = 'complete'
        )
    `;
    const scanCount = enrolledUsers.length;

    totalUnindexedFeed += feedCount;
    totalUnindexedGallery += galleryCount;
    totalScansNeeded += scanCount;

    if (feedCount > 0 || galleryCount > 0 || scanCount > 0) {
      console.log(`[Event] ${event.title || 'Untitled'} (${eventId})`);
      console.log(`  - Unindexed Feed Posts   : ${feedCount}`);
      console.log(`  - Unindexed Gallery Media: ${galleryCount}`);
      console.log(`  - Enrolled Users to Scan : ${scanCount}`);

      if (isApply) {
        let registeredForEvent = 0;

        // Register feed media
        for (const f of feedRows) {
          const storageKey = storageKeyFromUrl(f.media_url);
          if (!storageKey) continue;
          const thumbKey = storageKeyFromUrl(f.thumbnail_url);
          const sha = sha256Hex(storageKey);
          await prisma.$executeRaw`
            INSERT INTO media_assets (
              id, event_id, post_media_id, source, media_type,
              storage_key, thumbnail_storage_key, media_url, thumbnail_url,
              content_sha256, idempotency_key, uploaded_by, processing_status,
              match_complete, created_at, updated_at
            )
            VALUES (
              gen_random_uuid(), ${eventId}::uuid, ${f.id}::uuid, 'user_post', ${f.media_type}::media_type,
              ${storageKey}, ${thumbKey}, ${f.media_url}, ${f.thumbnail_url},
              ${sha}, ${'post-media:' + f.id}, ${f.user_id}::uuid, 'pending',
              false, now(), now()
            )
            ON CONFLICT (event_id, content_sha256) DO NOTHING
          `;
          registeredForEvent++;
        }

        // Register gallery media
        for (const g of galleryRows) {
          const storageKey = g.media_key || storageKeyFromUrl(g.media_url);
          if (!storageKey) continue;
          const thumbKey = g.thumbnail_key || storageKeyFromUrl(g.thumbnail_url);
          const sha = sha256Hex(storageKey);
          await prisma.$executeRaw`
            INSERT INTO media_assets (
              id, event_id, event_day_media_id, source, media_type,
              storage_key, thumbnail_storage_key, media_url, thumbnail_url,
              content_sha256, idempotency_key, uploaded_by, processing_status,
              match_complete, created_at, updated_at
            )
            VALUES (
              gen_random_uuid(), ${eventId}::uuid, ${g.id}::uuid, 'photographer', ${g.media_type}::media_type,
              ${storageKey}, ${thumbKey}, ${g.media_url}, ${g.thumbnail_url},
              ${sha}, ${'day-media:' + g.id}, ${g.uploaded_by ? g.uploaded_by + '::uuid' : null}, 'pending',
              false, now(), now()
            )
            ON CONFLICT (event_id, content_sha256) DO NOTHING
          `;
          registeredForEvent++;
        }
        totalRegistered += registeredForEvent;
        console.log(`  -> Registered ${registeredForEvent} media asset(s).`);

        // Insert/reset user_event_face_scans
        let createdScans = 0;
        for (const u of enrolledUsers) {
          await prisma.$executeRaw`
            INSERT INTO user_event_face_scans (
              user_id, event_id, reference_sha256, status, attempt_count,
              scanned_count, matched_count, created_at, updated_at
            )
            VALUES (
              ${u.user_id}::uuid, ${eventId}::uuid, ${u.content_sha256}, 'pending', 0,
              0, 0, now(), now()
            )
            ON CONFLICT (user_id, event_id) DO UPDATE SET
              status = 'pending',
              reference_sha256 = EXCLUDED.reference_sha256,
              updated_at = now()
          `;
          createdScans++;
        }
        totalScansCreated += createdScans;
        console.log(`  -> Queued ${createdScans} user event face scan(s).\n`);
      } else {
        console.log(`  -> (Dry-run: no database changes made)\n`);
      }
    }
  }

  console.log('-'.repeat(70));
  console.log('BACKFILL SUMMARY:');
  console.log(`  Events Checked               : ${events.length}`);
  console.log(`  Unindexed Feed Media Found   : ${totalUnindexedFeed}`);
  console.log(`  Unindexed Gallery Media Found: ${totalUnindexedGallery}`);
  console.log(`  Missing/Pending Scans Found  : ${totalScansNeeded}`);
  if (isApply) {
    console.log(`  Total Media Assets Registered: ${totalRegistered}`);
    console.log(`  Total Scans Queued / Reset   : ${totalScansCreated}`);
    console.log(`  Status                       : APPLIED SUCCESSFULLY`);
  } else {
    console.log(`  Status                       : DRY-RUN ONLY (pass --apply to execute)`);
  }
  console.log('-'.repeat(70));

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('[backfill] Error during execution:', error);
  await prisma.$disconnect();
  process.exit(1);
});
