import { forbidden, notFound, ok, serverError } from '@/lib/api-response';
import { getAdminFromAuthorizationHeader } from '@/lib/jwt';
import { mediaAssetIdSchema } from '@/lib/validations/people-media';
import { parseParams } from '@/lib/validations/parse';
import prisma from '@/server/prisma';
import { adminCanManageEvent, requeueMediaAsset } from '@/server/people-media/queries';

/** POST /api/media/:id/match — queue face matching again. Detection runs in the worker. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [params, error] = parseParams(await context.params, mediaAssetIdSchema);
    if (error) return error;
    const admin = getAdminFromAuthorizationHeader(request);
    if (!admin) return forbidden('Not authenticated');
    const asset = await prisma.media_assets.findUnique({
      where: { id: params.id },
      select: { id: true, event_id: true },
    });
    if (!asset || !(await adminCanManageEvent(admin, asset.event_id))) return notFound('Media not found');
    const queued = await requeueMediaAsset(asset.event_id, asset.id);
    if (!queued) return notFound('Media not found');
    return ok({ id: asset.id, processing_status: 'pending' }, 'Media queued', 202);
  } catch (error) {
    console.error('POST /api/media/[id]/match', error);
    return serverError('Unable to queue media matching');
  }
}
