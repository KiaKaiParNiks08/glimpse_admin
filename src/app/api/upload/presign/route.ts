import { NextRequest } from 'next/server';
import { ok, badRequest, serverError } from '@/lib/api-response';
import { createPresignedUpload } from '@/lib/s3-presign';

const presignBodySchema = {
  filename: (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 500,
  contentType: (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 200,
  prefix: (v: unknown) => v === undefined || (typeof v === 'string' && v.length <= 100),
};

/**
 * POST /api/upload/presign
 * Body: { filename: string, contentType: string, prefix?: string }
 * Returns { uploadUrl, fileUrl, key } for client to PUT the file to uploadUrl, then use fileUrl.
 */
export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest('Invalid JSON body');
    }

    const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
    if (!obj || !presignBodySchema.filename(obj.filename) || !presignBodySchema.contentType(obj.contentType)) {
      return badRequest('Body must include filename and contentType (string).');
    }
    if (!presignBodySchema.prefix(obj.prefix)) {
      return badRequest('prefix must be a string up to 100 characters.');
    }

    const filename = obj.filename as string;
    const contentType = (obj.contentType as string).split(';')[0].trim().toLowerCase();
    const prefix = (obj.prefix as string | undefined) ?? 'uploads';

    const result = await createPresignedUpload(filename, contentType, prefix);
    return ok(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Presign failed';
    if (message.startsWith('Invalid content type') || message.startsWith('AWS_') || message.startsWith('S3_')) {
      return badRequest(message);
    }
    console.error(e);
    return serverError('Presign failed');
  }
}
