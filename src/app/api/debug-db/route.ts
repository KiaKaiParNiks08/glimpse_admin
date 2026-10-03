import { ok, serverError, json } from '@/lib/api-response';

/**
 * Returns which DB connection the app is using (user, host, database only — no password).
 * Use this to confirm DATABASE_URL on the server: GET /api/debug-db
 * Remove or restrict this route in production.
 */
export async function GET() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return json(
      { hint: 'Set DATABASE_URL where the app runs (e.g. .env or server env)' },
      500,
      'DATABASE_URL not set'
    );
  }
  try {
    const parsed = new URL(url);
    return ok({
      user: parsed.username || null,
      host: parsed.hostname,
      port: parsed.port || '5432',
      database: parsed.pathname?.replace(/^\//, '').replace(/\?.*/, '') || null,
      hasPassword: !!parsed.password,
    });
  } catch {
    return serverError('DATABASE_URL is not a valid URL');
  }
}
