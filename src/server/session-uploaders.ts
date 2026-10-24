import prisma from '@/server/prisma';

export type SessionUploader = {
  id: string;
  event_id: string | null;
  event_session_id: string | null;
  all_sessions: boolean;
  mobile_number: string | null;
  country_code: string | null;
  email: string | null;
  session_title: string | null;
};

const uploaderSelect = {
  id: true,
  event_id: true,
  event_session_id: true,
  all_sessions: true,
  mobile_number: true,
  country_code: true,
  email: true,
  event_sessions: { select: { title: true } },
} as const;

function toUploader(row: {
  id: string;
  event_id: string | null;
  event_session_id: string | null;
  all_sessions: boolean;
  mobile_number: string | null;
  country_code: string | null;
  email: string | null;
  event_sessions: { title: string } | null;
}): SessionUploader {
  return {
    id: row.id,
    event_id: row.event_id,
    event_session_id: row.event_session_id,
    all_sessions: row.all_sessions,
    mobile_number: row.mobile_number,
    country_code: row.country_code,
    email: row.email,
    session_title: row.event_sessions?.title ?? null,
  };
}

export function normalizeMobile(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function mobilesMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = normalizeMobile(left);
  const b = normalizeMobile(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  return short.length >= 8 && long.endsWith(short);
}

function emailsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = normalizeEmail(left);
  const b = normalizeEmail(right);
  if (!a || !b) return false;
  if (a.endsWith('@glimps.guest') || b.endsWith('@glimps.guest')) return false;
  return a === b;
}

export function uploaderMatchesUser(
  uploader: { mobile_number: string | null; email: string | null },
  user: { mobile_number: string | null; email: string | null }
): boolean {
  return mobilesMatch(uploader.mobile_number, user.mobile_number) || emailsMatch(uploader.email, user.email);
}

export async function listUploadersForEvent(eventId: string): Promise<SessionUploader[]> {
  const rows = await prisma.event_session_uploaders.findMany({
    where: {
      OR: [
        { all_sessions: true, event_id: eventId },
        { event_sessions: { event_days: { event_id: eventId } } },
      ],
    },
    select: uploaderSelect,
    orderBy: { created_at: 'asc' },
  });
  return rows.map(toUploader);
}

export async function listUploadersForSessions(sessionIds: string[]): Promise<SessionUploader[]> {
  if (sessionIds.length === 0) return [];
  const rows = await prisma.event_session_uploaders.findMany({
    where: { event_session_id: { in: sessionIds } },
    select: uploaderSelect,
  });
  return rows.map(toUploader);
}

export async function addSessionUploader(input: {
  eventId: string;
  eventSessionId: string;
  mobile_number?: string | null;
  country_code?: string | null;
  email?: string | null;
}): Promise<SessionUploader> {
  const session = await prisma.event_sessions.findFirst({
    where: { id: input.eventSessionId, event_days: { event_id: input.eventId } },
    select: { id: true },
  });
  if (!session) throw new Error('SESSION_NOT_FOUND');

  const mobile_number = input.mobile_number?.trim() || null;
  const country_code = input.country_code?.trim() || null;
  const email = normalizeEmail(input.email) || null;
  if (!mobile_number && !email) throw new Error('CONTACT_REQUIRED');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('INVALID_EMAIL');
  if (mobile_number && normalizeMobile(mobile_number).length < 8) throw new Error('INVALID_MOBILE');

  const existing = await prisma.event_session_uploaders.findFirst({
    where: {
      event_session_id: session.id,
      OR: [
        mobile_number ? { mobile_number } : undefined,
        email ? { email } : undefined,
      ].filter(Boolean) as Array<{ mobile_number?: string; email?: string }>,
    },
    select: uploaderSelect,
  });
  if (existing) return toUploader(existing);

  const created = await prisma.event_session_uploaders.create({
    data: {
      event_session_id: session.id,
      all_sessions: false,
      mobile_number,
      country_code: mobile_number ? country_code : null,
      email,
    },
    select: uploaderSelect,
  });
  return toUploader(created);
}

function contactWhere(mobile_number: string | null, email: string | null) {
  return mobile_number ? { mobile_number } : { email: email ?? undefined };
}

/** Grant upload on every session of the event, or add the chosen sessions. */
export async function grantSessionUpload(input: {
  eventId: string;
  allSessions: boolean;
  eventSessionIds?: string[];
  mobile_number?: string | null;
  country_code?: string | null;
  email?: string | null;
}): Promise<SessionUploader[]> {
  const mobile_number = input.mobile_number?.trim() || null;
  const email = normalizeEmail(input.email) || null;
  if (!mobile_number && !email) throw new Error('CONTACT_REQUIRED');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('INVALID_EMAIL');
  if (mobile_number && normalizeMobile(mobile_number).length < 8) throw new Error('INVALID_MOBILE');
  const contact = contactWhere(mobile_number, email);
  const onThisEvent = {
    OR: [
      { event_id: input.eventId },
      { event_sessions: { event_days: { event_id: input.eventId } } },
    ],
  };

  if (input.allSessions) {
    await prisma.event_session_uploaders.deleteMany({
      where: { AND: [contact, onThisEvent] },
    });
    await prisma.event_session_uploaders.create({
      data: {
        event_id: input.eventId,
        all_sessions: true,
        mobile_number,
        country_code: mobile_number ? input.country_code?.trim() || null : null,
        email,
      },
    });
    return listUploadersForEvent(input.eventId);
  }

  const sessionIds = [...new Set(input.eventSessionIds ?? [])];
  if (sessionIds.length === 0) throw new Error('SESSION_REQUIRED');
  await prisma.event_session_uploaders.deleteMany({
    where: { AND: [contact, { all_sessions: true, event_id: input.eventId }] },
  });
  for (const eventSessionId of sessionIds) {
    await addSessionUploader({
      eventId: input.eventId,
      eventSessionId,
      mobile_number,
      country_code: input.country_code,
      email,
    });
  }
  return listUploadersForEvent(input.eventId);
}

export async function removeSessionUploader(input: {
  eventId: string;
  uploaderId: string;
}): Promise<boolean> {
  const row = await prisma.event_session_uploaders.findFirst({
    where: { id: input.uploaderId, event_sessions: { event_days: { event_id: input.eventId } } },
    select: { id: true },
  });
  if (!row) return false;
  await prisma.event_session_uploaders.delete({ where: { id: row.id } });
  return true;
}

export async function getViewerContact(userId: string): Promise<{
  mobile_number: string | null;
  email: string | null;
} | null> {
  return prisma.users.findUnique({
    where: { id: userId },
    select: { mobile_number: true, email: true },
  });
}

export async function sessionIdsViewerCanUpload(
  sessionIds: string[],
  viewerUserId: string | null | undefined
): Promise<Set<string>> {
  const allowed = new Set<string>();
  if (!viewerUserId || sessionIds.length === 0) return allowed;
  const sessions = await prisma.event_sessions.findMany({
    where: { id: { in: sessionIds } },
    select: { id: true, event_days: { select: { event_id: true } } },
  });
  const eventIds = [...new Set(sessions.map((session) => session.event_days.event_id))];
  const [user, uploaders] = await Promise.all([
    getViewerContact(viewerUserId),
    prisma.event_session_uploaders.findMany({
      where: {
        OR: [
          { event_session_id: { in: sessionIds } },
          ...(eventIds.length > 0 ? [{ all_sessions: true, event_id: { in: eventIds } }] : []),
        ],
      },
      select: uploaderSelect,
    }),
  ]);
  if (!user) return allowed;
  for (const uploader of uploaders.map(toUploader)) {
    if (!uploaderMatchesUser(uploader, user)) continue;
    if (uploader.all_sessions && uploader.event_id) {
      for (const session of sessions) {
        if (session.event_days.event_id === uploader.event_id) allowed.add(session.id);
      }
    } else if (uploader.event_session_id) {
      allowed.add(uploader.event_session_id);
    }
  }
  return allowed;
}
