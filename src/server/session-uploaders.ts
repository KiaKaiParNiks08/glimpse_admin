import prisma from '@/server/prisma';

export type SessionUploader = {
  id: string;
  event_session_id: string;
  mobile_number: string | null;
  country_code: string | null;
  email: string | null;
};

const uploaderSelect = {
  id: true,
  event_session_id: true,
  mobile_number: true,
  country_code: true,
  email: true,
} as const;

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
  return prisma.event_session_uploaders.findMany({
    where: { event_sessions: { event_days: { event_id: eventId } } },
    select: uploaderSelect,
    orderBy: { created_at: 'asc' },
  });
}

export async function listUploadersForSessions(sessionIds: string[]): Promise<SessionUploader[]> {
  if (sessionIds.length === 0) return [];
  return prisma.event_session_uploaders.findMany({
    where: { event_session_id: { in: sessionIds } },
    select: uploaderSelect,
  });
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
  if (existing) return existing;

  return prisma.event_session_uploaders.create({
    data: {
      event_session_id: session.id,
      mobile_number,
      country_code: mobile_number ? country_code : null,
      email,
    },
    select: uploaderSelect,
  });
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
  const [user, uploaders] = await Promise.all([
    getViewerContact(viewerUserId),
    listUploadersForSessions(sessionIds),
  ]);
  if (!user) return allowed;
  for (const uploader of uploaders) {
    if (uploaderMatchesUser(uploader, user)) allowed.add(uploader.event_session_id);
  }
  return allowed;
}
