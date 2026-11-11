-- Multi-tenant purchase plans, hierarchical RBAC roles/permissions, tenant scoping, and default superadmin seed

-- 1. Extend roles table
ALTER TABLE "roles"
  ADD COLUMN IF NOT EXISTS "scope" VARCHAR(20) NOT NULL DEFAULT 'tenant',
  ADD COLUMN IF NOT EXISTS "is_system" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "permissions" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. Create purchase_plans table
CREATE TABLE IF NOT EXISTS "purchase_plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(100) NOT NULL,
  "slug" VARCHAR(100) NOT NULL,
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

CREATE UNIQUE INDEX IF NOT EXISTS "purchase_plans_slug_key" ON "purchase_plans"("slug");

-- 3. Extend users table for hierarchy, tenant isolation, plan binding, overrides & custom permissions
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "parent_user_id" UUID,
  ADD COLUMN IF NOT EXISTS "tenant_owner_id" UUID,
  ADD COLUMN IF NOT EXISTS "purchase_plan_id" UUID,
  ADD COLUMN IF NOT EXISTS "feature_overrides" JSONB,
  ADD COLUMN IF NOT EXISTS "custom_permissions" JSONB;

CREATE INDEX IF NOT EXISTS "idx_users_parent_user_id" ON "users"("parent_user_id");
CREATE INDEX IF NOT EXISTS "idx_users_tenant_owner_id" ON "users"("tenant_owner_id");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_parent_user') THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "fk_users_parent_user"
      FOREIGN KEY ("parent_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_tenant_owner') THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "fk_users_tenant_owner"
      FOREIGN KEY ("tenant_owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_purchase_plan') THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "fk_users_purchase_plan"
      FOREIGN KEY ("purchase_plan_id") REFERENCES "purchase_plans"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_purchase_plans_created_by') THEN
    ALTER TABLE "purchase_plans"
      ADD CONSTRAINT "fk_purchase_plans_created_by"
      FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

-- 4. Staff <-> Client assignments (Super Admin assigns staff users to specific client admins)
CREATE TABLE IF NOT EXISTS "staff_client_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "staff_user_id" UUID NOT NULL,
  "client_user_id" UUID NOT NULL,
  "assigned_by" UUID,
  "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_client_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_staff_client_staff" FOREIGN KEY ("staff_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "fk_staff_client_client" FOREIGN KEY ("client_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "fk_staff_client_assigner" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX IF NOT EXISTS "unique_staff_client_assignment"
  ON "staff_client_assignments"("staff_user_id", "client_user_id");
CREATE INDEX IF NOT EXISTS "idx_staff_client_staff_id" ON "staff_client_assignments"("staff_user_id");
CREATE INDEX IF NOT EXISTS "idx_staff_client_client_id" ON "staff_client_assignments"("client_user_id");

-- 5. Tenant ownership columns on events and master tables (NULL = platform global)
ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "tenant_owner_id" UUID;
CREATE INDEX IF NOT EXISTS "idx_events_tenant_owner_id" ON "events"("tenant_owner_id");

ALTER TABLE "venues"
  ADD COLUMN IF NOT EXISTS "tenant_owner_id" UUID;

ALTER TABLE "app_themes"
  ADD COLUMN IF NOT EXISTS "tenant_owner_id" UUID;

ALTER TABLE "explore_categories"
  ADD COLUMN IF NOT EXISTS "tenant_owner_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_event_tenant_owner') THEN
    ALTER TABLE "events"
      ADD CONSTRAINT "fk_event_tenant_owner"
      FOREIGN KEY ("tenant_owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

-- 6. Seed default static system roles idempotently
INSERT INTO "roles" ("name", "description", "scope", "is_system", "permissions")
VALUES
  (
    'super_admin',
    'Full platform super administrator across all clients, plans, staff, and events',
    'platform',
    true,
    '["events.view","events.create","events.edit","events.delete","sessions.view","sessions.manage","media.view","media.upload","media.delete","team.view","team.manage","watermark.manage","highlights.manage","explore.manage","happening.manage","report.manage","people_media.view","qr.view","guests.export","notifications.send","venues.view","venues.manage","explore_categories.view","explore_categories.manage","app_themes.view","app_themes.manage","users.view","users.manage","plans.manage"]'::jsonb
  ),
  (
    'support_staff',
    'Internal team under Super Admin managing assigned clients and their events',
    'platform',
    true,
    '["events.view","events.create","events.edit","sessions.view","sessions.manage","media.view","media.upload","media.delete","team.view","team.manage","watermark.manage","highlights.manage","explore.manage","happening.manage","report.manage","people_media.view","qr.view","guests.export","notifications.send","venues.view","venues.manage","explore_categories.view","explore_categories.manage","app_themes.view","users.view","users.manage"]'::jsonb
  ),
  (
    'client_admin',
    'Client / Event Planner owner managing their purchased plan features, events, and team users',
    'tenant',
    true,
    '["events.view","events.create","events.edit","events.delete","sessions.view","sessions.manage","media.view","media.upload","media.delete","team.view","team.manage","watermark.manage","highlights.manage","explore.manage","happening.manage","report.manage","people_media.view","qr.view","guests.export","notifications.send","venues.view","venues.manage","explore_categories.view","explore_categories.manage","app_themes.view","app_themes.manage","users.view","users.manage"]'::jsonb
  ),
  (
    'event_admin',
    'Event coordinator / administrator managing assigned events within client plan',
    'tenant',
    true,
    '["events.view","events.edit","sessions.view","sessions.manage","media.view","media.upload","media.delete","team.view","team.manage","watermark.manage","highlights.manage","explore.manage","happening.manage","report.manage","people_media.view","qr.view","notifications.send","venues.view","explore_categories.view"]'::jsonb
  ),
  (
    'photographer',
    'Session photographer with view-only event/session access and session media upload permission',
    'tenant',
    true,
    '["events.view","sessions.view","media.view","media.upload"]'::jsonb
  ),
  (
    'coordinator',
    'Event coordinator managing sessions, guests, team details, and notifications',
    'tenant',
    true,
    '["events.view","sessions.view","sessions.manage","media.view","media.upload","team.view","team.manage","happening.manage","qr.view","notifications.send","venues.view"]'::jsonb
  ),
  (
    'user',
    'Mobile event guest user',
    'guest',
    true,
    '[]'::jsonb
  )
ON CONFLICT ("name") DO UPDATE SET
  "scope" = EXCLUDED."scope",
  "is_system" = true,
  "description" = COALESCE("roles"."description", EXCLUDED."description"),
  "permissions" = CASE
    WHEN "roles"."permissions" IS NULL OR jsonb_array_length("roles"."permissions") = 0
      THEN EXCLUDED."permissions"
    ELSE "roles"."permissions"
  END;

-- 7. Seed default purchase plans idempotently
INSERT INTO "purchase_plans" ("name", "slug", "description", "features", "max_events", "max_sub_users", "is_active", "is_default")
VALUES
  (
    'Starter — Events & Media Only',
    'media-sessions-only',
    'Core event creation, schedule sessions, planner/photographer team info, and session media upload without watermark, AI recognition, or favorites.',
    '{"event_basic":true,"event_sessions":true,"event_team":true,"session_media_upload":true,"event_qr":true,"sub_users_manage":true,"venues_manage":true,"event_watermark":false,"ai_recognition":false,"mobile_favorites":false,"mobile_feed":false,"event_explore":false,"event_highlights":false,"event_current_happening":false,"event_post_report":false,"event_guests_export":false,"push_notifications":false,"app_themes_manage":false,"explore_categories_manage":false}'::jsonb,
    10,
    5,
    true,
    false
  ),
  (
    'Pro Event Planner',
    'pro-planner',
    'Complete event planner suite including AI face recognition, watermark, favorites, feed, push notifications, explore mapping, highlights, and reports.',
    '{"event_basic":true,"event_sessions":true,"event_team":true,"session_media_upload":true,"event_qr":true,"sub_users_manage":true,"venues_manage":true,"event_watermark":true,"ai_recognition":true,"mobile_favorites":true,"mobile_feed":true,"event_explore":true,"event_highlights":true,"event_current_happening":true,"event_post_report":true,"event_guests_export":true,"push_notifications":true,"app_themes_manage":true,"explore_categories_manage":true}'::jsonb,
    50,
    25,
    true,
    true
  ),
  (
    'Enterprise Unlimited',
    'enterprise',
    'Unlimited events, sub-users, custom themes, private explore categories, AI face recognition, and all mobile engagement features.',
    '{"event_basic":true,"event_sessions":true,"event_team":true,"session_media_upload":true,"event_qr":true,"sub_users_manage":true,"venues_manage":true,"event_watermark":true,"ai_recognition":true,"mobile_favorites":true,"mobile_feed":true,"event_explore":true,"event_highlights":true,"event_current_happening":true,"event_post_report":true,"event_guests_export":true,"push_notifications":true,"app_themes_manage":true,"explore_categories_manage":true}'::jsonb,
    NULL,
    NULL,
    true,
    false
  )
ON CONFLICT ("slug") DO NOTHING;

-- 8. Seed default Super Admin account idempotently (password: superadmin@123)
INSERT INTO "users" ("full_name", "email", "password_hash", "role_id", "is_active")
SELECT
  'Super Admin',
  'superadmin@glimpse.app',
  'b6fec15f505852eedb851d5469c8e32d6a79b0ac8abea32ba7ea4596c15acaa8',
  r."id",
  true
FROM "roles" r
WHERE r."name" = 'super_admin'
ON CONFLICT ("email") DO NOTHING;
