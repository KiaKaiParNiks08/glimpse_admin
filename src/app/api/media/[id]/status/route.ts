import { forbidden, notFound, ok, serverError } from '@/lib/api-response';
import { getAdminFromAuthorizationHeader, getUserFromAuthorizationHeader } from '@/lib/jwt';
import { mediaAssetIdSchema } from '@/lib/validations/people-media';
import { parseParams } from '@/lib/validations/parse';
import prisma from '@/server/prisma';
import { adminCanManageEvent, getMediaStatusForAdmin, getMediaStatusForViewer } from '@/server/people-media/queries';

/** GET /api/media/:id/status */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [params, error] = parseParams(await context.params, mediaAssetIdSchema);
    if (error) return error;

    const user = getUserFromAuthorizationHeader(request);
    if (user) {
      const status = await getMediaStatusForViewer(params.id, user.id);
      if (status) return ok(status);
    }

    const admin = getAdminFromAuthorizationHeader(request);
    if (!admin) return user ? notFound('Media not found') : forbidden('Not authenticated');
    const asset = await prisma.media_assets.findUnique({
      where: { id: params.id },
      select: { event_id: true },
    });
    if (!asset || !(await adminCanManageEvent(admin, asset.event_id))) return notFound('Media not found');
    const status = await getMediaStatusForAdmin(params.id, asset.event_id);
    if (!status) return notFound('Media not found');
    return ok(status);
  } catch (error) {
    console.error('GET /api/media/[id]/status', error);
    return serverError('Unable to load media status');
  }
}
