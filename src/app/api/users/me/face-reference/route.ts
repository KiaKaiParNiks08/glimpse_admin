import { badRequest, forbidden, ok, serverError } from '@/lib/api-response';
import { getUserFromAuthorizationHeader } from '@/lib/jwt';
import { faceReferenceRevokeSchema } from '@/lib/validations/people-media';
import { parseBody } from '@/lib/validations/parse';
import { getMediaKind, validateMediaFile } from '@/lib/upload';
import {
  enrollFaceReference,
  getFaceReferenceStatus,
  revokeFaceReference,
} from '@/server/people-media/face-reference';

function requireUser(request: Request) {
  const user = getUserFromAuthorizationHeader(request);
  if (!user) return null;
  return user;
}

/** GET /api/users/me/face-reference — consent and processing status. No embedding or file key. */
export async function GET(request: Request) {
  const user = requireUser(request);
  if (!user) return forbidden('Not authenticated');
  try {
    const status = await getFaceReferenceStatus(user.id);
    return ok(status ?? { consent: false, processing_status: 'missing', has_embedding: false });
  } catch (error) {
    console.error('GET /api/users/me/face-reference', error);
    return serverError('Unable to load face reference');
  }
}

/**
 * PUT /api/users/me/face-reference
 * Enroll: multipart field "file" plus consent=true.
 * Revoke: JSON { "consent": false }.
 * The photo is stored and queued. Face detection runs in the worker, not in this request.
 */
export async function PUT(request: Request) {
  const user = requireUser(request);
  if (!user) return forbidden('Not authenticated');
  try {
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const [body, error] = await parseBody(request, faceReferenceRevokeSchema);
      if (error) return error;
      if (body.consent !== false) return badRequest('consent must be false to remove a face reference');
      const status = await revokeFaceReference(user.id);
      return ok(status ?? { consent: false, processing_status: 'missing', has_embedding: false }, 'Face reference removed');
    }

    const formData = await request.formData();
    if (formData.get('consent') !== 'true') {
      return badRequest('consent must be true before a face reference can be stored');
    }
    const file = formData.get('file');
    if (!file || !(file instanceof File) || file.size === 0) {
      return badRequest('Send an image in the file field');
    }
    if (getMediaKind(file.type) !== 'image') return badRequest('Face reference must be an image');
    const validationError = validateMediaFile(file, 'image');
    if (validationError) return badRequest(validationError);

    const status = await enrollFaceReference(user.id, file);
    return ok(status, 'Face reference queued', 202);
  } catch (error) {
    console.error('PUT /api/users/me/face-reference', error);
    return serverError('Unable to save face reference');
  }
}

/** DELETE /api/users/me/face-reference — withdraw consent and delete the biometric data. */
export async function DELETE(request: Request) {
  const user = requireUser(request);
  if (!user) return forbidden('Not authenticated');
  try {
    const status = await revokeFaceReference(user.id);
    return ok(status ?? { consent: false, processing_status: 'missing', has_embedding: false }, 'Face reference removed');
  } catch (error) {
    console.error('DELETE /api/users/me/face-reference', error);
    return serverError('Unable to remove face reference');
  }
}
