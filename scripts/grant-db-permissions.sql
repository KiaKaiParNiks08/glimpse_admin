-- Grant permissions for the application database user on AWS RDS.
-- Run as RDS master. Your DATABASE_URL uses database "postgres" and user "postgres".
--
-- Run from project root (replace MASTER_USER/MASTER_PASS and RDS_ENDPOINT):
--   psql "postgresql://MASTER_USER:MASTER_PASS@RDS_ENDPOINT:5432/postgres" -f scripts/grant-db-permissions.sql
--
-- Prisma P1010 "User was denied access" = this user lacks these privileges.

-- Allow connecting to the database (must match database in DATABASE_URL)
GRANT CONNECT ON DATABASE postgres TO glimps_app_user;

-- Use the public schema
GRANT USAGE ON SCHEMA public TO glimps_app_user;

-- Grant read/write on all current tables in public
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO glimps_app_user;

-- So that future tables also get these grants (recommended for Prisma migrations)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO glimps_app_user;

-- Sequences (e.g. roles.id)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO glimps_app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO glimps_app_user;
