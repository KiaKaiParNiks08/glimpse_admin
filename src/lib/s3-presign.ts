/**
 * S3 presigned URL generation for client-side uploads.
 * Secure approach (no ACLs): bucket stays private. Two options for viewing:
 * 1) CloudFront + OAC: set S3_PUBLIC_BASE_URL to CloudFront URL; objects are served via CDN.
 * 2) Presigned GET: leave S3_PUBLIC_BASE_URL unset; stored URL is /api/upload/signed?key=... which redirects to a short-lived presigned GET.
 */

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { ALLOWED_IMAGE_TYPES, ALLOWED_VIDEO_TYPES, ALLOWED_PDF_TYPES } from './media-types';

const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'application/pdf': '.pdf',
};

const ALLOWED_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_VIDEO_TYPES,
  ...ALLOWED_PDF_TYPES,
] as readonly string[];

const PRESIGN_EXPIRES_IN = 900; // 15 minutes

function getS3Client(): S3Client {
  const region = process.env.AWS_REGION;
  if (!region) throw new Error('AWS_REGION is required for S3 presign');
  return new S3Client({
    region,
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  });
}

function getBucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error('S3_BUCKET is required for S3 presign');
  return bucket;
}

const PRESIGN_GET_EXPIRES_IN = 3600; // 1 hour for view URLs

import { encryptKey } from '@/lib/upload-token';

/**
 * Build the URL to store for an object. No ACLs; bucket is private.
 * - If S3_PUBLIC_BASE_URL is set (CloudFront): return public CDN URL.
 * - Otherwise: return our proxy URL with opaque token (no key/path exposed to client).
 */
function getPublicUrl(key: string): string {
  const base = process.env.S3_PUBLIC_BASE_URL;
  if (base) {
    const normalized = base.replace(/\/$/, '');
    return `${normalized}/${key}`;
  }
  const token = encryptKey(key);
  if (token) return `/api/upload/signed?t=${token}`;
  return `/api/upload/signed?key=${encodeURIComponent(key)}`;
}

/** Return the URL to store after uploading (opaque token or CloudFront). Use from server-side upload. */
export function getStoredObjectUrl(key: string): string {
  return getPublicUrl(key);
}

/**
 * Generate a presigned GET URL for viewing a private object.
 * Use only server-side (e.g. server-to-server). Do not send to the browser.
 */
export async function createPresignedGetUrl(key: string): Promise<string> {
  const bucket = getBucket();
  const client = getS3Client();
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: PRESIGN_GET_EXPIRES_IN });
}

export type GetObjectStreamResult = {
  body: ReadableStream;
  contentType: string;
  contentLength?: number;
  cacheControl?: string;
};

/**
 * Fetch an object from S3 and return a stream + metadata.
 * Use this to proxy images to the browser so the client never sees S3 or AWS credentials.
 */
export async function getObjectBuffer(key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const bucket = getBucket();
  const client = getS3Client();
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) return null;
  const bytes = await response.Body.transformToByteArray();
  return {
    buffer: Buffer.from(bytes),
    contentType: response.ContentType ?? 'application/octet-stream',
  };
}

export async function getObjectStream(key: string): Promise<GetObjectStreamResult | null> {
  const bucket = getBucket();
  const client = getS3Client();
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await client.send(command);
  if (!response.Body) return null;
  return {
    body: response.Body as ReadableStream,
    contentType: response.ContentType ?? 'application/octet-stream',
    contentLength: response.ContentLength,
    cacheControl: response.CacheControl ?? undefined,
  };
}

/**
 * Validate content type and derive extension. Throws if invalid.
 */
function validateContentType(contentType: string): string {
  const normalized = contentType.split(';')[0].trim().toLowerCase();
  if (!(ALLOWED_TYPES as readonly string[]).includes(normalized)) {
    throw new Error(
      `Invalid content type: ${contentType}. Allowed: images (JPEG, PNG, GIF, WebP), videos (MP4, WebM, MOV), PDF.`
    );
  }
  return MIME_EXT[normalized] ?? '.bin';
}

/**
 * Generate a safe S3 key: prefix/YYYY/MM/uuid.ext
 */
export function generateS3Key(prefix: string, contentType: string): string {
  const ext = validateContentType(contentType);
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const id = randomUUID();
  const raw = (prefix ?? '').trim().replace(/^\/+|\/+$/g, '');

  // Allow hierarchical prefixes like "events/<eventId>/days/<dayId>" while blocking traversal and weird chars.
  // This keeps keys compatible with /api/upload/signed allowlist (e.g. "events/").
  const safePrefix =
    raw &&
    raw.length <= 200 &&
    /^[a-z0-9/_-]+$/i.test(raw) &&
    !raw.includes('..') &&
    !raw.includes('//')
      ? raw
      : 'uploads';

  return `${safePrefix}/${y}/${m}/${id}${ext}`;
}

export interface PresignResult {
  uploadUrl: string;
  fileUrl: string;
  key: string;
}

/**
 * Generate a presigned PUT URL for uploading a file. The client must PUT the file
 * to uploadUrl with the same Content-Type as contentType.
 */
export async function createPresignedUpload(
  filename: string,
  contentType: string,
  prefix: string = 'uploads'
): Promise<PresignResult> {
  validateContentType(contentType);
  const key = generateS3Key(prefix, contentType);
  const bucket = getBucket();
  const client = getS3Client();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType.split(';')[0].trim(),
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: PRESIGN_EXPIRES_IN,
  });

  const fileUrl = getPublicUrl(key);
  return { uploadUrl, fileUrl, key };
}

/**
 * Upload a file to S3 from the server (buffer in memory).
 * Use for server-side upload proxy so the client never sees S3 or presigned URLs.
 */
export async function putObjectFromBuffer(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  const bucket = getBucket();
  const client = getS3Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType.split(';')[0].trim(),
  });
  await client.send(command);
}

/**
 * Delete an object from S3.
 * Safe to call even if object is already missing (S3 delete is idempotent).
 */
export async function deleteObjectByKey(key: string): Promise<void> {
  const bucket = getBucket();
  const client = getS3Client();
  const command = new DeleteObjectCommand({ Bucket: bucket, Key: key });
  await client.send(command);
}
