import { createHash } from 'crypto';
import prisma from '@/server/prisma';
import {
  ALL_FEATURES_ENABLED,
  ESSENTIAL_PLAN_FEATURES,
  SIGNATURE_PLAN_FEATURES,
  ELITE_PLAN_FEATURES,
  PERMISSION_KEYS,
  ROLE_DEFAULT_PERMISSIONS,
  STARTER_MEDIA_FEATURES,
} from '@/lib/rbac';

const DEFAULT_SUPERADMIN_EMAIL = 'superadmin@glimpse.app';
const DEFAULT_SUPERADMIN_PASSWORD_HASH = createHash('sha256')
  .update('superadmin@123')
  .digest('hex');

let seeded = false;
let seedingPromise: Promise<void> | null = null;

async function runBootstrap(): Promise<void> {
  try {
    // Fast-path check (1 lightweight read query) skips all DDL and upserts once migrations are applied.
    try {
      const checkRows = await prisma.$queryRawUnsafe<Array<{ ready: boolean }>>(`
        SELECT (
          EXISTS (SELECT 1 FROM "purchase_plans" WHERE "slug" = 'essential')
          AND EXISTS (SELECT 1 FROM "purchase_plans" WHERE "slug" = 'signature')
          AND EXISTS (SELECT 1 FROM "purchase_plans" WHERE "slug" = 'elite')
          AND EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'client_admin' AND "is_system" = true)
          AND EXISTS (SELECT 1 FROM "users" WHERE "email" = '${DEFAULT_SUPERADMIN_EMAIL}')
          AND EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'events' AND column_name = 'custom_plan_id'
          )
        ) AS "ready"
      `);
      if (checkRows[0]?.ready) {
        seeded = true;
        return;
      }
    } catch {
      // Tables or columns not yet created — fall through to full bootstrap.
    }

    // Ensure schema columns/tables exist safely if running before migrate deploy
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "roles"
        ADD COLUMN IF NOT EXISTS "scope" VARCHAR(20) NOT NULL DEFAULT 'tenant',
        ADD COLUMN IF NOT EXISTS "is_system" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "permissions" JSONB NOT NULL DEFAULT '[]'::jsonb;

      CREATE TABLE IF NOT EXISTS "purchase_plans" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "name" VARCHAR(100) NOT NULL,
        "slug" VARCHAR(100) NOT NULL UNIQUE,
        "description" TEXT,
        "features" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "max_events" INTEGER,
        "max_sub_users" INTEGER,
        "max_event_admins" INTEGER,
        "max_session_media_uploaders" INTEGER,
        "is_custom" BOOLEAN NOT NULL DEFAULT false,
        "is_recommended" BOOLEAN NOT NULL DEFAULT false,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "is_default" BOOLEAN NOT NULL DEFAULT false,
        "created_by" UUID,
        "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "purchase_plans_pkey" PRIMARY KEY ("id")
      );

      ALTER TABLE "purchase_plans"
        ADD COLUMN IF NOT EXISTS "max_event_admins" INTEGER,
        ADD COLUMN IF NOT EXISTS "max_session_media_uploaders" INTEGER,
        ADD COLUMN IF NOT EXISTS "is_custom" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "is_recommended" BOOLEAN NOT NULL DEFAULT false;

      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "parent_user_id" UUID,
        ADD COLUMN IF NOT EXISTS "tenant_owner_id" UUID,
        ADD COLUMN IF NOT EXISTS "purchase_plan_id" UUID,
        ADD COLUMN IF NOT EXISTS "feature_overrides" JSONB,
        ADD COLUMN IF NOT EXISTS "custom_permissions" JSONB;

      CREATE TABLE IF NOT EXISTS "staff_client_assignments" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "staff_user_id" UUID NOT NULL,
        "client_user_id" UUID NOT NULL,
        "assigned_by" UUID,
        "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "staff_client_assignments_pkey" PRIMARY KEY ("id")
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "unique_staff_client_assignment"
        ON "staff_client_assignments"("staff_user_id", "client_user_id");

      ALTER TABLE "events"
        ADD COLUMN IF NOT EXISTS "tenant_owner_id" UUID,
        ADD COLUMN IF NOT EXISTS "custom_plan_id" UUID;

      CREATE INDEX IF NOT EXISTS "idx_events_custom_plan_id"
        ON "events"("custom_plan_id");

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_events_custom_plan'
        ) THEN
          ALTER TABLE "events"
            ADD CONSTRAINT "fk_events_custom_plan"
            FOREIGN KEY ("custom_plan_id")
            REFERENCES "purchase_plans"("id")
            ON DELETE SET NULL
            ON UPDATE CASCADE;
        END IF;
      END $$;

      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'post_status') THEN
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumtypid = 'post_status'::regtype
              AND enumlabel = 'moderated'
          ) THEN
            ALTER TYPE "post_status" ADD VALUE 'moderated';
          END IF;
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS "post_moderation_audits" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "post_id" UUID NOT NULL,
        "event_id" UUID NOT NULL,
        "moderated_by" UUID NOT NULL,
        "action" VARCHAR(30) NOT NULL,
        "reason" VARCHAR(100),
        "comment" TEXT,
        "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "post_moderation_audits_pkey" PRIMARY KEY ("id")
      );

      CREATE INDEX IF NOT EXISTS "idx_post_moderation_audits_post"
        ON "post_moderation_audits"("post_id");
      CREATE INDEX IF NOT EXISTS "idx_post_moderation_audits_event"
        ON "post_moderation_audits"("event_id");
      CREATE INDEX IF NOT EXISTS "idx_post_moderation_audits_created_at"
        ON "post_moderation_audits"("created_at" DESC);

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_pma_post'
        ) THEN
          ALTER TABLE "post_moderation_audits"
            ADD CONSTRAINT "fk_pma_post"
            FOREIGN KEY ("post_id")
            REFERENCES "posts"("id")
            ON DELETE CASCADE
            ON UPDATE CASCADE;
        END IF;
      END $$;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_pma_event'
        ) THEN
          ALTER TABLE "post_moderation_audits"
            ADD CONSTRAINT "fk_pma_event"
            FOREIGN KEY ("event_id")
            REFERENCES "events"("id")
            ON DELETE CASCADE
            ON UPDATE CASCADE;
        END IF;
      END $$;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_pma_user'
        ) THEN
          ALTER TABLE "post_moderation_audits"
            ADD CONSTRAINT "fk_pma_user"
            FOREIGN KEY ("moderated_by")
            REFERENCES "users"("id")
            ON DELETE RESTRICT
            ON UPDATE CASCADE;
        END IF;
      END $$;

      ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "tenant_owner_id" UUID;
      ALTER TABLE "app_themes" ADD COLUMN IF NOT EXISTS "tenant_owner_id" UUID;
      ALTER TABLE "explore_categories" ADD COLUMN IF NOT EXISTS "tenant_owner_id" UUID;

      -- Legacy plan in-place migration if essential/signature/elite do not yet exist
      UPDATE "purchase_plans"
      SET "slug" = 'essential',
          "name" = 'Glimpse Essential',
          "max_event_admins" = 2,
          "max_session_media_uploaders" = 1,
          "is_recommended" = false
      WHERE "slug" = 'media-sessions-only'
        AND NOT EXISTS (SELECT 1 FROM "purchase_plans" WHERE "slug" = 'essential');

      UPDATE "purchase_plans"
      SET "slug" = 'signature',
          "name" = 'Glimpse Signature',
          "max_event_admins" = 5,
          "max_session_media_uploaders" = 3,
          "is_recommended" = true
      WHERE "slug" = 'pro-planner'
        AND NOT EXISTS (SELECT 1 FROM "purchase_plans" WHERE "slug" = 'signature');

      UPDATE "purchase_plans"
      SET "slug" = 'elite',
          "name" = 'Glimpse Elite',
          "max_event_admins" = 10,
          "max_session_media_uploaders" = 10,
          "is_recommended" = false
      WHERE "slug" = 'enterprise'
        AND NOT EXISTS (SELECT 1 FROM "purchase_plans" WHERE "slug" = 'elite');
    `);

    const systemRoles = [
      {
        name: 'super_admin',
        description: 'Full platform super administrator across all clients, plans, staff, and events',
        scope: 'platform',
        permissions: [...PERMISSION_KEYS],
      },
      {
        name: 'support_staff',
        description: 'Internal team under Super Admin managing assigned clients and their events',
        scope: 'platform',
        permissions: ROLE_DEFAULT_PERMISSIONS.support_staff,
      },
      {
        name: 'client_admin',
        description: 'Client / Event Planner owner managing their purchased plan features, events, and team users',
        scope: 'tenant',
        permissions: ROLE_DEFAULT_PERMISSIONS.client_admin,
      },
      {
        name: 'event_admin',
        description: 'Event coordinator / administrator managing assigned events within client plan',
        scope: 'tenant',
        permissions: ROLE_DEFAULT_PERMISSIONS.event_admin,
      },
      {
        name: 'photographer',
        description: 'Session photographer with view-only event/session access and session media upload permission',
        scope: 'tenant',
        permissions: ROLE_DEFAULT_PERMISSIONS.photographer,
      },
      {
        name: 'coordinator',
        description: 'Event coordinator managing sessions, guests, team details, and notifications',
        scope: 'tenant',
        permissions: ROLE_DEFAULT_PERMISSIONS.coordinator,
      },
      {
        name: 'user',
        description: 'Mobile event guest user',
        scope: 'guest',
        permissions: [],
      },
    ];

    for (const r of systemRoles) {
      const existing = await prisma.roles.findUnique({
        where: { name: r.name },
        select: { id: true, permissions: true },
      });
      if (!existing) {
        await prisma.roles.create({
          data: {
            name: r.name,
            description: r.description,
            scope: r.scope,
            is_system: true,
            permissions: r.permissions,
          },
        });
      } else {
        const hasPerms = Array.isArray(existing.permissions) && existing.permissions.length > 0;
        await prisma.roles.update({
          where: { id: existing.id },
          data: {
            scope: r.scope,
            is_system: true,
            ...(!hasPerms ? { permissions: r.permissions } : {}),
          },
        });
      }
    }

    const defaultPlans = [
      {
        slug: 'essential',
        name: 'Glimpse Essential',
        description: 'For every celebration, big or small.',
        features: ESSENTIAL_PLAN_FEATURES,
        max_events: 10,
        max_sub_users: 5,
        max_event_admins: 2,
        max_session_media_uploaders: 1,
        is_recommended: false,
        is_default: false,
      },
      {
        slug: 'signature',
        name: 'Glimpse Signature',
        description: 'The complete experience for exceptional events.',
        features: SIGNATURE_PLAN_FEATURES,
        max_events: 50,
        max_sub_users: 25,
        max_event_admins: 5,
        max_session_media_uploaders: 3,
        is_recommended: true,
        is_default: true,
      },
      {
        slug: 'elite',
        name: 'Glimpse Elite',
        description: 'Prestige, priority, and unbounded possibilities.',
        features: ELITE_PLAN_FEATURES,
        max_events: null,
        max_sub_users: null,
        max_event_admins: 10,
        max_session_media_uploaders: 10,
        is_recommended: false,
        is_default: false,
      },
    ];

    for (const plan of defaultPlans) {
      const existingPlan = await prisma.purchase_plans.findUnique({
        where: { slug: plan.slug },
        select: { id: true },
      });
      if (!existingPlan) {
        await prisma.purchase_plans.create({
          data: {
            name: plan.name,
            slug: plan.slug,
            description: plan.description,
            features: plan.features,
            max_events: plan.max_events,
            max_sub_users: plan.max_sub_users,
            max_event_admins: plan.max_event_admins,
            max_session_media_uploaders: plan.max_session_media_uploaders,
            is_active: true,
            is_recommended: plan.is_recommended,
            is_default: plan.is_default,
          },
        });
      } else {
        await prisma.purchase_plans.update({
          where: { id: existingPlan.id },
          data: {
            name: plan.name,
            description: plan.description,
            features: plan.features,
            max_event_admins: plan.max_event_admins,
            max_session_media_uploaders: plan.max_session_media_uploaders,
            is_recommended: plan.is_recommended,
          },
        });
      }
    }

    // Seed default Super Admin account idempotently (does NOT overwrite modified password/profile)
    const superAdminRole = await prisma.roles.findUnique({
      where: { name: 'super_admin' },
      select: { id: true },
    });
    if (superAdminRole) {
      const existingSuperAdmin = await prisma.users.findUnique({
        where: { email: DEFAULT_SUPERADMIN_EMAIL },
        select: { id: true },
      });
      if (!existingSuperAdmin) {
        await prisma.users.create({
          data: {
            full_name: 'Super Admin',
            email: DEFAULT_SUPERADMIN_EMAIL,
            password_hash: DEFAULT_SUPERADMIN_PASSWORD_HASH,
            role_id: superAdminRole.id,
            is_active: true,
          },
        });
      }
    }

    seeded = true;
  } catch (err) {
    console.error('[seed-rbac] bootstrap failed:', err);
  }
}

export async function ensureRbacBootstrapped(): Promise<void> {
  if (seeded) return;
  if (!seedingPromise) {
    seedingPromise = runBootstrap().finally(() => {
      seedingPromise = null;
    });
  }
  await seedingPromise;
}
