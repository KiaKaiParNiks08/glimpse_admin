'use server';

import { qrSvg } from '@/lib/qr-svg';
import { isShareEventCode, joinUrl } from '@/lib/app-share';
import { getAdminSessionFromCookies } from '@/lib/admin-session';
import { isEventAdminAssigned } from '@/server/events';
import prisma from '@/server/prisma';

export type EventShareQrResult =
  | { ok: true; data: { title: string; event_code: string; join_url: string; svg: string } }
  | { ok: false; error: string };

export async function getEventShareQrAction(eventId: string): Promise<EventShareQrResult> {
  const session = await getAdminSessionFromCookies();
  if (!session) return { ok: false, error: 'Not authenticated' };
  if (!eventId) return { ok: false, error: 'Event ID required' };

  if (session.role_name === 'event_admin') {
    const allowed = await isEventAdminAssigned(eventId, session.id);
    if (!allowed) return { ok: false, error: 'Event not found' };
  } else if (session.role_name !== 'super_admin') {
    return { ok: false, error: 'Forbidden' };
  }

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
