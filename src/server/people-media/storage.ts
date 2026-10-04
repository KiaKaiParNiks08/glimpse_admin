import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';
import { decryptToken } from '@/lib/upload-token';
import { getObjectBuffer } from '@/lib/s3-presign';

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function contentTypeFromKey(key: string): string {
  const ext = path.extname(key.split('?')[0] ?? '').toLowerCase();
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

/** Recover an object key from a stored media URL. Never returns a remote http(s) URL. */
export function storageKeyFromMediaUrl(url: string | null | undefined, mediaKey?: string | null): string | null {
  if (mediaKey?.trim()) return mediaKey.trim();
  const raw = url?.trim();
  if (!raw) return null;
  const publicBase = process.env.S3_PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (publicBase && raw.startsWith(`${publicBase}/`)) {
    const key = decodeURIComponent(raw.slice(publicBase.length + 1).split('?')[0] ?? '');
    if (key && !key.includes('..') && !key.startsWith('/')) return key;
  }
  if (raw.startsWith('http://') || raw.startsWith('https://')) return null;
  if (raw.startsWith('/uploads/') || raw.startsWith('uploads/')) return raw.replace(/^\//, '');
  try {
    if (raw.startsWith('/api/upload/signed')) {
      const parsed = new URL(raw, 'http://local');
      const token = parsed.searchParams.get('t');
      const keyParam = parsed.searchParams.get('key');
      if (token) return decryptToken(token);
      if (keyParam) return decodeURIComponent(keyParam);
    }
  } catch {
    return null;
  }
  return null;
}

export async function readStoredMedia(storageKey: string): Promise<{ bytes: Buffer; contentType: string }> {
  const key = storageKey.trim().replace(/^\//, '');
  if (!key || key.includes('..') || key.includes('\\') || key.startsWith('http://') || key.startsWith('https://')) {
    throw new Error('Unsupported storage key');
  }

  if (key.startsWith('uploads/')) {
    const root = path.resolve(process.cwd(), 'public');
    const full = path.resolve(root, key);
    if (full !== root && !full.startsWith(root + path.sep)) {
      throw new Error('Unsupported storage key');
    }
    const bytes = await readFile(full);
    return { bytes, contentType: contentTypeFromKey(key) };
  }

  const object = await getObjectBuffer(key);
  if (!object) throw new Error('Stored object not found');
  return { bytes: object.buffer, contentType: object.contentType || contentTypeFromKey(key) };
}
