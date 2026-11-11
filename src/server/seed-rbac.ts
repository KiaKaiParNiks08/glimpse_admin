import { createHash } from 'crypto';
import prisma from '@/server/prisma';
import {
  ALL_FEATURES_ENABLED,
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
          EXISTS (SELECT 1 FROM "purchase_plans" LIMIT 1)
          AND EXISTS (SELECT 1 FROM "roles" WHERE "name" = 'client_admin' AND "is_system" = true)
          AND EXISTS (SELECT 1 FROM "users" WHERE "email" = '${DEFAULT_SUPERADMIN_EMAIL}')
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
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "is_default" BOOLEAN NOT NULL DEFAULT false,
        "created_by" UUID,
        "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "purchase_plans_pkey" PRIMARY KEY ("id")
      );

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

      ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "tenant_owner_id" UUID;
      ALTER TABLE "venues" ADD COLUMN IF NOT EXISTS "tenant_owner_id" UUID;
      ALTER TABLE "app_themes" ADD COLUMN IF NOT EXISTS "tenant_owner_id" UUID;
      ALTER TABLE "explore_categories" ADD COLUMN IF NOT EXISTS "tenant_owner_id" UUID;
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
        slug: 'media-sessions-only',
        name: 'Starter — Events & Media Only',
        description:
          'Core event creation, schedule sessions, planner/photographer team info, and session media upload without watermark, AI recognition, or favorites.',
        features: STARTER_MEDIA_FEATURES,
        max_events: 10,
        max_sub_users: 5,
        is_default: false,
      },
      {
        slug: 'pro-planner',
        name: 'Pro Event Planner',
        description:
          'Complete event planner suite including AI face recognition, watermark, favorites, feed, push notifications, explore mapping, highlights, and reports.',
        features: ALL_FEATURES_ENABLED,
        max_events: 50,
        max_sub_users: 25,
        is_default: true,
      },
      {
        slug: 'enterprise',
        name: 'Enterprise Unlimited',
        description:
          'Unlimited events, sub-users, custom themes, private explore categories, AI face recognition, and all mobile engagement features.',
        features: ALL_FEATURES_ENABLED,
        max_events: null,
        max_sub_users: null,
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
            is_active: true,
            is_default: plan.is_default,
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
