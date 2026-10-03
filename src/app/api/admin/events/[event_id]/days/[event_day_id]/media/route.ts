import { NextRequest } from 'next/server';
import { ok, badRequest, forbidden, notFound, serverError } from '@/lib/api-response';
import { getAdminFromAuthorizationHeader } from '@/lib/jwt';
import { isEventAdminAssigned } from '@/server/events';
import prisma from '@/server/prisma';
import { createEventDayMedia } from '@/server/event-day-media';

type CreateMediaItem = {
  media_key: string;
  media_url: string;
  media_type: 'image' | 'video';
  display_order?: number;
};

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function isValidMediaType(v: unknown): v is 'image' | 'video' {
  return v === 'image' || v === 'video';
}

/**
 * POST /api/admin/events/[event_id]/days/[event_day_id]/media
 * Body: { event_session_id, items: [{ media_key, media_url, media_type, display_order? }] }
 * event_session_id must be a session of this day.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ event_id: string; event_day_id: string }> }
) {
  try {
    const admin = getAdminFromAuthorizationHeader(request);
    if (!admin) return forbidden('Not authenticated');

    const params = await context.params;
    const eventId = params.event_id;
    const eventDayId = params.event_day_id;
    if (!isUuid(eventId) || !isUuid(eventDayId)) return badRequest('Invalid event/day id');

    if (admin.role_name === 'event_admin') {
      const allowed = await isEventAdminAssigned(eventId, admin.id);
      if (!allowed) return notFound('Event not found');
    }

    const day = await prisma.event_days.findFirst({
      where: { id: eventDayId, event_id: eventId },
      select: { id: true },
    });
    if (!day) return notFound('Event day not found');

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest('Invalid JSON body');
    }
    const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
    const eventSessionId = obj?.event_session_id;
    if (!isUuid(eventSessionId)) return badRequest('event_session_id is required');
    const session = await prisma.event_sessions.findFirst({
      where: { id: eventSessionId, event_day_id: eventDayId },
      select: { id: true },
    });
    if (!session) return notFound('Session not found for this day');
    const itemsRaw = obj?.items;
    if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) return badRequest('items must be a non-empty array');
    if (itemsRaw.length > 50) return badRequest('Too many items (max 50)');

    const items: CreateMediaItem[] = [];
    for (let i = 0; i < itemsRaw.length; i++) {
      const it = itemsRaw[i] as Record<string, unknown>;
      const media_key = typeof it?.media_key === 'string' ? it.media_key.trim() : '';
      const media_url = typeof it?.media_url === 'string' ? it.media_url.trim() : '';
      const media_type = it?.media_type;
      const display_order =
        it?.display_order === undefined ? undefined : Number.parseInt(String(it.display_order), 10);

      if (!media_key || media_key.length > 1024) return badRequest(`Invalid media_key at index ${i}`);
      if (!media_url || media_url.length > 2000) return badRequest(`Invalid media_url at index ${i}`);
      if (!isValidMediaType(media_type)) return badRequest(`Invalid media_type at index ${i}`);
      if (display_order !== undefined && (!Number.isFinite(display_order) || display_order < 0))
        return badRequest(`Invalid display_order at index ${i}`);

      items.push({ media_key, media_url, media_type, ...(display_order !== undefined && { display_order }) });
    }

    const created = await createEventDayMedia(
      items.map((it) => ({
        event_day_id: eventDayId,
        event_session_id: session.id,
        media_key: it.media_key,
        media_url: it.media_url,
        media_type: it.media_type,
        display_order: it.display_order ?? null,
        uploaded_by: admin.id,
      }))
    );

    return ok({ data: created });
  } catch (e) {
    console.error(e);
    return serverError('Unable to save event day media');
  }
}

