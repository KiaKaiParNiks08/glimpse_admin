/**
 * Whether the incoming request is served over HTTPS (or TLS-terminated with x-forwarded-proto).
 * Used for Set-Cookie `secure` so sessions work on HTTP (e.g. IP:port) while staying secure on HTTPS.
 */
export function isRequestHttps(request: Request): boolean {
  const url = new URL(request.url);
  if (url.protocol === 'https:') return true;
  const forwarded = request.headers.get('x-forwarded-proto');
  return forwarded?.split(',')[0]?.trim() === 'https';
}
