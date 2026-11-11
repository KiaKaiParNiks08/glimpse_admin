'use server';

import { qrSvg } from '@/lib/qr-svg';
import { isShareEventCode, joinUrl } from '@/lib/app-share';
import { requireAdminContextFromCookies, canContextAccessEvent } from '@/server/access';
import prisma from '@/server/prisma';

export type EventShareQrResult =
  | { ok: true; data: { title: string; event_code: string; join_url: string; svg: string } }
  | { ok: false; error: string };

export async function getEventShareQrAction(eventId: string): Promise<EventShareQrResult> {
  const auth = await requireAdminContextFromCookies();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!eventId) return { ok: false, error: 'Event ID required' };

  if (!auth.ctx.hasPermission('qr.view')) {
    return { ok: false, error: 'Forbidden: QR links are disabled for your plan or role' };
  }
  const allowed = await canContextAccessEvent(auth.ctx, eventId);
  if (!allowed) return { ok: false, error: 'Event not found' };

  const event = await prisma.events.findUnique({
    where: { id: eventId },
    select: { title: true, event_code: true },
  });
  if (!event || !isShareEventCode(event.event_code)) {
    return { ok: false, error: 'This event code cannot be shared as a QR' };
  }

  const url = joinUrl(event.event_code);
  const svg = await qrSvg(url);
  return {
    ok: true,
    data: { title: event.title, event_code: event.event_code, join_url: url, svg },
  };
}
