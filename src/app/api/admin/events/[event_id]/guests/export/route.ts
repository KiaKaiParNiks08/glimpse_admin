import { NextRequest, NextResponse } from 'next/server';
import { badRequest, forbidden, notFound, serverError } from '@/lib/api-response';
import { getAdminFromAuthorizationHeader } from '@/lib/jwt';
import { listEventGuestsForExport } from '@/server/event-guests';

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function csvEscape(cell: string): string {
  if (/[",\r\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
  return cell;
}

function safeFilenamePart(code: string): string {
  const s = code.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return s.slice(0, 80) || 'event';
}

/**
 * GET /api/admin/events/[event_id]/guests/export
 * CSV of app users (guests) for the event. super_admin only.
 * Columns: full name, mobile number, Instagram ID, is verified (OTP), is active, and wedding side when the event category is wedding.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ event_id: string }> }
) {
  try {
    const admin = getAdminFromAuthorizationHeader(request);
    if (!admin) return forbidden('Not authenticated');
    if (admin.role_name !== 'super_admin') return forbidden('Forbidden');

    const params = await context.params;
    const eventId = params.event_id;
    if (!isUuid(eventId)) return badRequest('Invalid event id');

    const bundle = await listEventGuestsForExport(eventId);
    if (!bundle) return notFound('Event not found');

    const headersRow = bundle.is_wedding
      ? [
          'Full name',
          'Mobile number',
          'Instagram ID',
          'Is verified',
          'Is active',
          'Wedding side',
        ]
      : ['Full name', 'Mobile number', 'Instagram ID', 'Is verified', 'Is active'];

    const lines = [
      headersRow.map(csvEscape).join(','),
      ...bundle.rows.map((r) => {
        const base = [
          r.full_name,
          r.mobile,
          r.instagram_id,
          r.is_verified,
          r.is_active,
        ].map(csvEscape);
        if (bundle.is_wedding) base.push(csvEscape(r.wedding_side));
        return base.join(',');
      }),
    ];

    const csvBody = `\uFEFF${lines.join('\r\n')}`;
    const filename = `event-${safeFilenamePart(bundle.event_code)}-guests.csv`;

    return new NextResponse(csvBody, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    console.error(e);
    return serverError('Unable to export guests');
  }
}
