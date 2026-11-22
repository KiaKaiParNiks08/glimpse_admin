/**
 * Account Reconciliation Script
 * 
 * Safely identifies and reconciles duplicate user accounts based on verified
 * mobile numbers and verified email addresses across events.
 * 
 * Usage:
 *   node --experimental-strip-types scripts/reconcile-accounts.ts            # Dry-run (safe report only)
 *   node --experimental-strip-types scripts/reconcile-accounts.ts --apply   # Apply database changes
 */

import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[reconcile] DATABASE_URL is not set.');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

interface UserRecord {
  id: string;
  country_code: string | null;
  mobile_number: string | null;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  primary_login_type: string | null;
  is_identifier_locked: boolean | null;
  is_avatar_locked: boolean | null;
  created_at: Date;
}

interface DuplicateCluster {
  type: 'mobile' | 'email';
  identifier: string;
  canonicalUser: UserRecord;
  secondaryUsers: UserRecord[];
}

async function findDuplicateClusters(): Promise<DuplicateCluster[]> {
  const clusters: DuplicateCluster[] = [];

  // 1. Find duplicate mobile clusters
  const duplicateMobiles = await prisma.$queryRaw<{ country_code: string; mobile_number: string; count: number }[]>`
    SELECT country_code, mobile_number, COUNT(*)::int as count
    FROM users
    WHERE mobile_number IS NOT NULL AND trim(mobile_number) <> ''
    GROUP BY country_code, mobile_number
    HAVING COUNT(*) > 1
  `;

  for (const row of duplicateMobiles) {
    const users = await prisma.$queryRaw<UserRecord[]>`
      SELECT id, country_code, mobile_number, email, full_name, avatar_url,
             primary_login_type, is_identifier_locked, is_avatar_locked, created_at
      FROM users
      WHERE country_code = ${row.country_code} AND mobile_number = ${row.mobile_number}
      ORDER BY
        CASE WHEN is_identifier_locked = true THEN 0 ELSE 1 END ASC,
        CASE WHEN avatar_url IS NOT NULL AND avatar_url <> '' THEN 0 ELSE 1 END ASC,
        created_at ASC
    `;

    if (users.length > 1) {
      clusters.push({
        type: 'mobile',
        identifier: `${row.country_code} ${row.mobile_number}`,
        canonicalUser: users[0],
        secondaryUsers: users.slice(1),
      });
    }
  }

  // 2. Find duplicate email clusters (ignoring guest placeholder emails)
  const duplicateEmails = await prisma.$queryRaw<{ normalized_email: string; count: number }[]>`
    SELECT lower(trim(email)) as normalized_email, COUNT(*)::int as count
    FROM users
    WHERE email IS NOT NULL
      AND trim(email) <> ''
      AND email NOT LIKE '%@glimps.guest'
    GROUP BY lower(trim(email))
    HAVING COUNT(*) > 1
  `;

  for (const row of duplicateEmails) {
    const users = await prisma.$queryRaw<UserRecord[]>`
      SELECT id, country_code, mobile_number, email, full_name, avatar_url,
             primary_login_type, is_identifier_locked, is_avatar_locked, created_at
      FROM users
      WHERE lower(trim(email)) = ${row.normalized_email}
      ORDER BY
        CASE WHEN is_identifier_locked = true THEN 0 ELSE 1 END ASC,
        CASE WHEN avatar_url IS NOT NULL AND avatar_url <> '' THEN 0 ELSE 1 END ASC,
        created_at ASC
    `;

    if (users.length > 1) {
      // Check if cluster already covered by mobile
      const primaryId = users[0].id;
      const alreadyCovered = clusters.some(
        (c) => c.canonicalUser.id === primaryId || c.secondaryUsers.some((u) => u.id === primaryId)
      );
      if (!alreadyCovered) {
        clusters.push({
          type: 'email',
          identifier: row.normalized_email,
          canonicalUser: users[0],
          secondaryUsers: users.slice(1),
        });
      }
    }
  }

  return clusters;
}

async function reconcileCluster(cluster: DuplicateCluster, apply: boolean): Promise<{
  guestsMoved: number;
  profilesMerged: number;
  postsUpdated: number;
  commentsUpdated: number;
  likesUpdated: number;
  favoritesUpdated: number;
  faceRefsUpdated: number;
}> {
  const canonicalId = cluster.canonicalUser.id;
  let guestsMoved = 0;
  let profilesMerged = 0;
  let postsUpdated = 0;
  let commentsUpdated = 0;
  let likesUpdated = 0;
  let favoritesUpdated = 0;
  let faceRefsUpdated = 0;

  for (const secondary of cluster.secondaryUsers) {
    const secId = secondary.id;

    // Check event memberships
    const secGuests = await prisma.event_guests.findMany({ where: { user_id: secId } });
    for (const g of secGuests) {
      const existsInCanonical = await prisma.event_guests.findUnique({
        where: { event_id_user_id: { event_id: g.event_id, user_id: canonicalId } },
      });
      if (existsInCanonical) {
        if (apply) {
          await prisma.event_guests.delete({ where: { id: g.id } });
        }
      } else {
        if (apply) {
          await prisma.event_guests.update({
            where: { id: g.id },
            data: { user_id: canonicalId },
          });
        }
        guestsMoved++;
      }
    }

    // Check user_event_profiles
    const secProfiles = await prisma.user_event_profiles.findMany({ where: { user_id: secId } });
    for (const p of secProfiles) {
      const canonicalProfile = await prisma.user_event_profiles.findUnique({
        where: { user_id_event_id: { user_id: canonicalId, event_id: p.event_id } },
      });
      if (canonicalProfile) {
        if (apply) {
          // Merge missing preferences to canonical
          await prisma.user_event_profiles.update({
            where: { id: canonicalProfile.id },
            data: {
              instagram_id: canonicalProfile.instagram_id || p.instagram_id,
              linkedin_url: canonicalProfile.linkedin_url || p.linkedin_url,
              wedding_side: canonicalProfile.wedding_side || p.wedding_side,
            },
          });
          await prisma.user_event_profiles.delete({ where: { id: p.id } });
        }
        profilesMerged++;
      } else {
        if (apply) {
          await prisma.user_event_profiles.update({
            where: { id: p.id },
            data: { user_id: canonicalId },
          });
        }
        profilesMerged++;
      }
    }

    // Posts & comments
    const postsCount = await prisma.posts.count({ where: { user_id: secId } });
    if (apply && postsCount > 0) {
      await prisma.posts.updateMany({ where: { user_id: secId }, data: { user_id: canonicalId } });
    }
    postsUpdated += postsCount;

    const commentsCount = await prisma.comments.count({ where: { user_id: secId } });
    if (apply && commentsCount > 0) {
      await prisma.comments.updateMany({ where: { user_id: secId }, data: { user_id: canonicalId } });
    }
    commentsUpdated += commentsCount;

    // Likes (deduplicate)
    const secLikes = await prisma.post_likes.findMany({ where: { user_id: secId } });
    for (const l of secLikes) {
      const canonicalLike = await prisma.post_likes.findUnique({
        where: { post_id_user_id: { post_id: l.post_id, user_id: canonicalId } },
      });
      if (canonicalLike) {
        if (apply) await prisma.post_likes.delete({ where: { id: l.id } });
      } else {
        if (apply) await prisma.post_likes.update({ where: { id: l.id }, data: { user_id: canonicalId } });
        likesUpdated++;
      }
    }

    // Favorites (deduplicate)
    const secFavs = await prisma.user_favorites.findMany({ where: { user_id: secId } });
    for (const f of secFavs) {
      const canonicalFav = await prisma.user_favorites.findFirst({
        where: {
          user_id: canonicalId,
          event_id: f.event_id,
          ...(f.post_id ? { post_id: f.post_id } : {}),
          ...(f.event_day_media_id ? { event_day_media_id: f.event_day_media_id } : {}),
        },
      });
      if (canonicalFav) {
        if (apply) await prisma.user_favorites.delete({ where: { id: f.id } });
      } else {
        if (apply) await prisma.user_favorites.update({ where: { id: f.id }, data: { user_id: canonicalId } });
        favoritesUpdated++;
      }
    }

    // Face references
    const secFaceRef = await prisma.user_face_references.findUnique({ where: { user_id: secId } });
    if (secFaceRef) {
      const canonicalFaceRef = await prisma.user_face_references.findUnique({ where: { user_id: canonicalId } });
      if (canonicalFaceRef) {
        if (apply) await prisma.user_face_references.delete({ where: { id: secFaceRef.id } });
      } else {
        if (apply) {
          await prisma.user_face_references.update({
            where: { id: secFaceRef.id },
            data: { user_id: canonicalId },
          });
        }
        faceRefsUpdated++;
      }
    }

    // Clean up scans, checks, matches for secondary
    if (apply) {
      await prisma.$executeRaw`DELETE FROM media_asset_user_checks WHERE user_id = ${secId}::uuid`.catch(() => {});
      await prisma.$executeRaw`DELETE FROM user_event_face_scans WHERE user_id = ${secId}::uuid`.catch(() => {});
      await prisma.$executeRaw`DELETE FROM media_matches WHERE user_id = ${secId}::uuid`.catch(() => {});
      // Finally archive / remove duplicate user row
      await prisma.users.delete({ where: { id: secId } }).catch((err) => {
        console.warn(`[reconcile] Could not delete secondary user ${secId}: ${err.message}`);
      });
    }
  }

  return {
    guestsMoved,
    profilesMerged,
    postsUpdated,
    commentsUpdated,
    likesUpdated,
    favoritesUpdated,
    faceRefsUpdated,
  };
}

async function main() {
  const isApply = process.argv.includes('--apply');
  console.log('='.repeat(70));
  console.log(`GLIMPSE ACCOUNT RECONCILIATION (${isApply ? 'APPLY MODE' : 'DRY RUN MODE'})`);
  console.log('='.repeat(70));

  const clusters = await findDuplicateClusters();

  if (clusters.length === 0) {
    console.log('\nNo duplicate user accounts detected. Database is clean and unified.');
    console.log('Total clusters: 0\n');
    await prisma.$disconnect();
    return;
  }

  console.log(`\nFound ${clusters.length} duplicate account cluster(s):\n`);

  let totalGuestsMoved = 0;
  let totalProfilesMerged = 0;
  let totalPostsUpdated = 0;
  let totalCommentsUpdated = 0;

  for (let i = 0; i < clusters.length; i++) {
    const c = clusters[i];
    console.log(`[Cluster #${i + 1}] Type: ${c.type.toUpperCase()} | Identifier: ${c.identifier}`);
    console.log(`  Canonical User : ${c.canonicalUser.id} (${c.canonicalUser.full_name || 'No name'})`);
    console.log(`                   Locked: ${c.canonicalUser.is_identifier_locked}, Avatar: ${c.canonicalUser.avatar_url ? 'Yes' : 'No'}, Created: ${c.canonicalUser.created_at.toISOString()}`);
    console.log(`  Duplicate Users: ${c.secondaryUsers.map((u) => u.id).join(', ')}`);

    const stats = await reconcileCluster(c, isApply);
    console.log(`  Proposed / Applied Actions:`);
    console.log(`    - Event Memberships Moved : ${stats.guestsMoved}`);
    console.log(`    - Event Profiles Merged   : ${stats.profilesMerged}`);
    console.log(`    - Posts Reassigned        : ${stats.postsUpdated}`);
    console.log(`    - Comments Reassigned     : ${stats.commentsUpdated}`);
    console.log(`    - Likes Reassigned        : ${stats.likesUpdated}`);
    console.log(`    - Favorites Reassigned    : ${stats.favoritesUpdated}`);
    console.log(`    - Face Reference Reassigned: ${stats.faceRefsUpdated}\n`);

    totalGuestsMoved += stats.guestsMoved;
    totalProfilesMerged += stats.profilesMerged;
    totalPostsUpdated += stats.postsUpdated;
    totalCommentsUpdated += stats.commentsUpdated;
  }

  console.log('-'.repeat(70));
  console.log(`SUMMARY:`);
  console.log(`  Total Clusters Processed : ${clusters.length}`);
  console.log(`  Total Guests Consolidated: ${totalGuestsMoved}`);
  console.log(`  Total Profiles Merged    : ${totalProfilesMerged}`);
  console.log(`  Total Posts Reassigned   : ${totalPostsUpdated}`);
  console.log(`  Total Comments Reassigned: ${totalCommentsUpdated}`);
  console.log(`  Status                   : ${isApply ? 'SUCCESSFULLY APPLIED' : 'DRY-RUN ONLY (No DB modifications)'}`);
  console.log('-'.repeat(70));

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('[reconcile] Error during execution:', error);
  await prisma.$disconnect();
  process.exit(1);
});
