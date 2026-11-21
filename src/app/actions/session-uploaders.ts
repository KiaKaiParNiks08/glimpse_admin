'use server';

import prisma from '@/server/prisma';
import { canContextAccessEvent, getEventEffectiveEntitlements, requireAdminContextFromCookies } from '@/server/access';
import {
  listUploadersForEvent,
  grantSessionUpload,
  removeSessionUploader,
  countUniqueEventUploaders,
  type SessionUploader,
} from '@/server/session-uploaders';

export type SessionUploaderQuota = {
  current_count: number;
  max_allowed: number;
  plan_name: string | null;
  plan_slug: string | null;
};

async function requireEventAccess(eventId: string) {
  const gate = await requireAdminContextFromCookies();
  if (!gate.ok) return { ok: false as const, error: gate.error };
  const canAccess = await canContextAccessEvent(gate.ctx, eventId);
  if (!canAccess) return { ok: false as const, error: 'Forbidden' };
  return { ok: true as const, ctx: gate.ctx };
}

export async function listEventSessionUploadersAction(
  eventId: string
): Promise<{ ok: true; data: SessionUploader[] } | { ok: false; error: string }> {
  const access = await requireEventAccess(eventId);
  if (!access.ok) return { ok: false, error: access.error };
  try {
    const data = await listUploadersForEvent(eventId);
    return { ok: true, data };
  } catch (e: any) {
    console.error(e);
    return { ok: false, error: e?.message || 'Failed to list session uploaders' };
  }
}

export async function getSessionUploaderQuotaAction(
  eventId: string
): Promise<{ ok: true; data: SessionUploaderQuota } | { ok: false; error: string }> {
  const access = await requireEventAccess(eventId);
  if (!access.ok) return { ok: false, error: access.error };
  try {
    const [current_count, entitlements] = await Promise.all([
      countUniqueEventUploaders(eventId),
      getEventEffectiveEntitlements(eventId),
    ]);
    return {
      ok: true,
      data: {
        current_count,
        max_allowed: entitlements.limits.max_session_media_uploaders,
        plan_name: entitlements.plan.name,
        plan_slug: entitlements.plan.slug,
      },
    };
  } catch (e: any) {
    console.error(e);
    return { ok: false, error: e?.message || 'Failed to get session uploader quota' };
  }
}

export async function grantSessionUploadAction(input: {
  eventId: string;
  allSessions: boolean;
  eventSessionIds?: string[];
  mobile_number?: string | null;
  country_code?: string | null;
  email?: string | null;
}): Promise<{ ok: true; data: SessionUploader[] } | { ok: false; error: string }> {
  const access = await requireEventAccess(input.eventId);
  if (!access.ok) return { ok: false, error: access.error };
  try {
    const data = await grantSessionUpload(input);
    return { ok: true, data };
  } catch (e: any) {
    console.error(e);
    return { ok: false, error: e?.message || 'Failed to grant session upload' };
  }
}

export async function removeSessionUploaderAction(input: {
  eventId: string;
  uploaderId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await requireEventAccess(input.eventId);
  if (!access.ok) return { ok: false, error: access.error };
  try {
    const success = await removeSessionUploader(input);
    if (!success) return { ok: false, error: 'Uploader not found' };
    return { ok: true };
  } catch (e: any) {
    console.error(e);
    return { ok: false, error: e?.message || 'Failed to remove session uploader' };
  }
}
