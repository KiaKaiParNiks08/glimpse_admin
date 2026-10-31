import prisma from '@/server/prisma';
import { FACE_CONSENT_VERSION } from './config';
import { ensurePeopleMediaSchema } from './ensure-schema';
import { ensureUserEventScans } from './scans';
import { backfillEventMedia } from './register';
import { sha256Hex, storageKeyFromMediaUrl } from './storage';

export type EventRecognitionBackfillSummary = {
  dry_run: boolean;
  event_id: string;
  media_registered: number;
  references_ready: number;
  references_pending: number;
  references_failed: number;
  references_created_from_avatar: number;
  scans_queued: number;
  scans_already_complete: number;
  uploader_matches_invalidated: number;
  legacy_matches_promoted: number;
  failed_assets_requeued: number;
  failed_scans_requeued: number;
};

async function countUploaderMatches(eventId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
    FROM media_matches mm
    JOIN media_assets ma ON ma.id = mm.media_asset_id
    WHERE ma.event_id = ${eventId}::uuid
      AND (
        mm.match_source = 'uploader_attributed'
        OR (
          mm.match_source = 'legacy'
          AND ma.uploaded_by IS NOT NULL
          AND mm.user_id = ma.uploaded_by
          AND mm.similarity >= 0.999
        )
      )
  `;
  return rows[0]?.n ?? 0;
}

async function countLegacyPromotable(eventId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n
    FROM media_matches mm
    JOIN media_assets ma ON ma.id = mm.media_asset_id
    WHERE ma.event_id = ${eventId}::uuid
      AND mm.match_source = 'legacy'
      AND mm.similarity >= 0.8
      AND mm.similarity < 0.999
      AND NOT (
        ma.uploaded_by IS NOT NULL
        AND mm.user_id = ma.uploaded_by
        AND mm.similarity >= 0.999
      )
  `;
  return rows[0]?.n ?? 0;
}

/**
 * Queue recognition for one event without running CompareFaces in this request.
 * Reuses valid face references. Does not require guests to re-upload profile photos.
 */
export async function backfillEventRecognition(
  eventId: string,
  options?: { dryRun?: boolean }
): Promise<EventRecognitionBackfillSummary> {
  await ensurePeopleMediaSchema();
  const dryRun = options?.dryRun === true;

  const event = await prisma.events.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) throw new Error('Event not found');

  let media_registered = 0;
  if (dryRun) {
    const missing = await prisma.$queryRaw<{ n: number }[]>`
      SELECT (
        (SELECT COUNT(*) FROM post_media pm
          JOIN posts p ON p.id = pm.post_id
          LEFT JOIN media_assets ma ON ma.post_media_id = pm.id
          WHERE p.event_id = ${eventId}::uuid AND p.status = 'active'
            AND pm.media_type IN ('image', 'video') AND ma.id IS NULL)
        + (SELECT COUNT(*) FROM event_day_media edm
          JOIN event_days ed ON ed.id = edm.event_day_id
          LEFT JOIN media_assets ma ON ma.event_day_media_id = edm.id
          WHERE ed.event_id = ${eventId}::uuid
            AND edm.media_type IN ('image', 'video') AND ma.id IS NULL)
      )::int AS n
    `;
    media_registered = missing[0]?.n ?? 0;
  } else {
    media_registered = await backfillEventMedia(eventId);
  }

  const refCounts = await prisma.$queryRaw<
    { processing_status: string; n: number }[]
  >`
    SELECT ufr.processing_status, COUNT(*)::int AS n
    FROM user_face_references ufr
    JOIN event_guests eg ON eg.user_id = ufr.user_id AND eg.event_id = ${eventId}::uuid
    WHERE ufr.consent = true AND ufr.revoked_at IS NULL AND ufr.storage_key IS NOT NULL
    GROUP BY ufr.processing_status
  `;
  const refCount = (status: string) => refCounts.find((row) => row.processing_status === status)?.n ?? 0;

  const guestsMissingRef = await prisma.$queryRaw<{ user_id: string; avatar_url: string | null }[]>`
    SELECT u.id AS user_id, u.avatar_url
    FROM event_guests eg
    JOIN users u ON u.id = eg.user_id
    LEFT JOIN user_face_references ufr ON ufr.user_id = u.id
    WHERE eg.event_id = ${eventId}::uuid
      AND u.avatar_url IS NOT NULL
      AND ufr.user_id IS NULL
  `;

  let references_created_from_avatar = 0;
  if (!dryRun) {
    for (const guest of guestsMissingRef) {
      const storageKey = storageKeyFromMediaUrl(guest.avatar_url);
      if (!storageKey) continue;
      await prisma.$executeRaw`
        INSERT INTO user_face_references (
          id, user_id, consent, consent_version, consented_at, revoked_at,
          storage_key, content_sha256, processing_status, attempt_count, last_error, embedding,
          reference_version, updated_at
        )
        VALUES (
          gen_random_uuid(), ${guest.user_id}::uuid, true, ${FACE_CONSENT_VERSION}, now(), NULL,
          ${storageKey}, ${sha256Hex(storageKey)}, 'pending', 0, NULL, NULL, 1, now()
        )
        ON CONFLICT (user_id) DO NOTHING
      `;
      references_created_from_avatar += 1;
    }
  } else {
    references_created_from_avatar = guestsMissingRef.filter((row) => storageKeyFromMediaUrl(row.avatar_url)).length;
  }

  const readyRefs = await prisma.$queryRaw<{ user_id: string; content_sha256: string | null; processing_status: string }[]>`
    SELECT ufr.user_id, ufr.content_sha256, ufr.processing_status
    FROM user_face_references ufr
    JOIN event_guests eg ON eg.user_id = ufr.user_id AND eg.event_id = ${eventId}::uuid
    WHERE ufr.consent = true AND ufr.revoked_at IS NULL AND ufr.storage_key IS NOT NULL
  `;

  let scans_queued = 0;
  let scans_already_complete = 0;
  if (!dryRun) {
    for (const ref of readyRefs) {
      if (ref.processing_status === 'failed' || ref.processing_status === 'pending') {
        await prisma.user_face_references.updateMany({
          where: { user_id: ref.user_id, processing_status: { in: ['failed', 'pending'] } },
          data: { processing_status: 'pending', next_retry_at: null, last_error: null },
        });
      }
      await ensureUserEventScans(ref.user_id, ref.content_sha256 ?? '');
    }
  }
  const scanRows = await prisma.$queryRaw<{ status: string; n: number }[]>`
    SELECT status, COUNT(*)::int AS n
    FROM user_event_face_scans
    WHERE event_id = ${eventId}::uuid
    GROUP BY status
  `;
  scans_queued = scanRows.filter((row) => row.status !== 'complete').reduce((sum, row) => sum + row.n, 0);
  scans_already_complete = scanRows.find((row) => row.status === 'complete')?.n ?? 0;

  const uploaderCount = await countUploaderMatches(eventId);
  const legacyCount = await countLegacyPromotable(eventId);
  let failed_assets_requeued = 0;
  let failed_scans_requeued = 0;
  let uploader_matches_invalidated = 0;
  let legacy_matches_promoted = 0;

  if (!dryRun) {
    const assets = await prisma.media_assets.updateMany({
      where: { event_id: eventId, processing_status: 'failed' },
      data: { processing_status: 'pending', next_retry_at: null, match_complete: false, attempt_count: 0, last_error: null },
    });
    failed_assets_requeued = assets.count;
    failed_scans_requeued = await prisma.$executeRaw`
      UPDATE user_event_face_scans
      SET status = 'pending', next_retry_at = NULL, attempt_count = 0, last_error = NULL, updated_at = now()
      WHERE event_id = ${eventId}::uuid AND status = 'failed'
    `;
    uploader_matches_invalidated = await prisma.$executeRaw`
      UPDATE media_matches mm
      SET match_source = 'uploader_attributed'
      FROM media_assets ma
      WHERE mm.media_asset_id = ma.id
        AND ma.event_id = ${eventId}::uuid
        AND mm.match_source = 'legacy'
        AND ma.uploaded_by IS NOT NULL
        AND mm.user_id = ma.uploaded_by
        AND mm.similarity >= 0.999
    `;
    legacy_matches_promoted = await prisma.$executeRaw`
      UPDATE media_matches mm
      SET match_source = 'rekognition',
          algorithm_version = COALESCE(mm.algorithm_version, 'rekognition_restored')
      FROM media_assets ma
      WHERE mm.media_asset_id = ma.id
        AND ma.event_id = ${eventId}::uuid
        AND mm.match_source = 'legacy'
        AND mm.similarity >= 0.8
        AND mm.similarity < 0.999
    `;
  } else {
    failed_assets_requeued = await prisma.media_assets.count({
      where: { event_id: eventId, processing_status: 'failed' },
    });
    const failedScans = await prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM user_event_face_scans
      WHERE event_id = ${eventId}::uuid AND status = 'failed'
    `;
    failed_scans_requeued = failedScans[0]?.n ?? 0;
    uploader_matches_invalidated = uploaderCount;
    legacy_matches_promoted = legacyCount;
  }

  return {
    dry_run: dryRun,
    event_id: eventId,
    media_registered,
    references_ready: refCount('ready'),
    references_pending: refCount('pending') + refCount('processing'),
    references_failed: refCount('failed'),
    references_created_from_avatar,
    scans_queued,
    scans_already_complete,
    uploader_matches_invalidated,
    legacy_matches_promoted,
    failed_assets_requeued: Number(failed_assets_requeued),
    failed_scans_requeued: Number(failed_scans_requeued),
  };
}
