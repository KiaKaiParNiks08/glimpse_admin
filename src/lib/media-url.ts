/**
 * Resolves a stored media URL or S3 key into an absolute or proxy image URL.
 */
export function resolveMediaUrl(url?: string | null): string | null {
  if (!url) return null;
  const value = url.trim();
  if (!value) return null;
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) {
    return value;
  }
  return `/api/upload/signed?key=${encodeURIComponent(value)}`;
}
