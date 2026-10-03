-- Run this connected as your APP user (the one in DATABASE_URL) to verify permissions.
-- If you see "permission denied" or empty results where you expect data, grants are missing.
--
-- Connect as app user:
--   psql "postgresql://postgres:YOUR_PASSWORD@dev-glimp-db....rds.amazonaws.com:5432/postgres" -f scripts/verify-db-permissions.sql

\echo 'Current user and database:'
SELECT current_user, current_database();

\echo ''
\echo 'Testing read access on roles (required for auth):'
SELECT id, name FROM roles LIMIT 2;

\echo ''
\echo 'Testing read access on app_configurations:'
SELECT id, platform FROM app_configurations LIMIT 2;

\echo ''
\echo 'If both queries returned rows (or empty table), permissions are OK.'
