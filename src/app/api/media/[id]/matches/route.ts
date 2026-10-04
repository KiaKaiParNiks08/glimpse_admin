import { forbidden, notFound, ok, serverError } from '@/lib/api-response';
import { getAdminFromAuthorizationHeader } from '@/lib/jwt';
import { mediaAssetIdSchema } from '@/lib/validations/people-media';
import { parseParams } from '@/lib/validations/parse';
import prisma from '@/server/prisma';
import { adminCanManageEvent, listAssetMatches } from '@/server/people-media/queries';

async function loadManagedAsset(request: Request, assetId: string) {
  const admin = getAdminFromAuthorizationHeader(request);
  if (!admin) return { error: forbidden('Not authenticated'), asset: null };
  const asset = await prisma.media_assets.findUnique({
    where: { id: assetId },
    select: { id: true, event_id: true, processing_status: true },
  });
  if (!asset || !(await adminCanManageEvent(admin, asset.event_id))) {
    return { error: notFound('Media not found'), asset: null };
  }
  return { error: null, asset };
}

/** GET /api/media/:id/matches — matched users and scores. Embeddings are not included. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [params, error] = parseParams(await context.params, mediaAssetIdSchema);
    if (error) return error;
    const loaded = await loadManagedAsset(request, params.id);
    if (loaded.error || !loaded.asset) return loaded.error;
    const matches = await listAssetMatches(loaded.asset.event_id, loaded.asset.id);
    return ok({ matches });
  } catch (error) {
    console.error('GET /api/media/[id]/matches', error);
    return serverError('Unable to load matches');
  }
}
