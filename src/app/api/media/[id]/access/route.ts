import { forbidden, notFound, ok, serverError } from '@/lib/api-response';
import { getAdminFromAuthorizationHeader, getUserFromAuthorizationHeader } from '@/lib/jwt';
import { mediaAssetIdSchema } from '@/lib/validations/people-media';
import { parseParams } from '@/lib/validations/parse';
import prisma from '@/server/prisma';
import { adminCanManageEvent, getSecureMediaUrl } from '@/server/people-media/queries';

/** GET /api/media/:id/access — opaque media URL for a matched user, the uploader, or an event admin. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [params, error] = parseParams(await context.params, mediaAssetIdSchema);
    if (error) return error;

    const user = getUserFromAuthorizationHeader(request);
    if (user) {
      const media = await getSecureMediaUrl(params.id, user.id);
      if (media) return ok(media);
    }

    const admin = getAdminFromAuthorizationHeader(request);
    if (!admin) return user ? notFound('Media not found') : forbidden('Not authenticated');
    const asset = await prisma.media_assets.findUnique({
      where: { id: params.id },
      select: { id: true, event_id: true, media_url: true, media_type: true, processing_status: true },
    });
    if (!asset || !(await adminCanManageEvent(admin, asset.event_id))) return notFound('Media not found');
    return ok({
      media_asset_id: asset.id,
      media_type: asset.media_type,
      media_url: asset.media_url,
      processing_status: asset.processing_status,
    });
  } catch (error) {
    console.error('GET /api/media/[id]/access', error);
    return serverError('Unable to load media');
  }
}
