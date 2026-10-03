import { NextResponse } from 'next/server';

/** Standard API body shape for all API routes */
export interface ApiBody<T = unknown> {
  message: string;
  data: T;
  /** Present for paginated list endpoints when the handler passes `{ data, meta }` to `ok()`. */
  meta?: unknown;
}

/**
 * Paginated handlers pass `{ data: items, meta }` to `ok()`. Hoist to the top level so the JSON
 * body is `{ message, data: items, meta }` instead of `{ message, data: { data: items, meta } }`.
 */
function splitPaginatedPayload(payload: unknown): { data: unknown; meta: unknown } | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !('data' in record) || !('meta' in record)) return null;
  return { data: record.data, meta: record.meta };
}

/**
 * Normalize legacy payloads that used { data: ... } wrapper.
 * If payload is exactly { data: value }, unwrap it to avoid data.data nesting.
 */
function normalizeData<T>(payload: T): unknown {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length === 1 && keys[0] === 'data') return record.data;
  }
  return payload;
}

function envelope<T>(message: string, payload: T): ApiBody {
  const paginated = splitPaginatedPayload(payload);
  if (paginated) {
    return {
      message,
      data: paginated.data,
      meta: paginated.meta,
    };
  }
  return {
    message,
    data: normalizeData(payload) as ApiBody['data'],
  };
}

/**
 * Build a JSON NextResponse with optional message and status.
 * Supports both:
 *   ok(data)
 *   ok(data, 201)
 *   ok(data, 'Created')
 *   ok(data, 'Created', 201)
 */
export function ok<T>(
  data: T,
  messageOrStatus: string | number = 'Success',
  maybeStatus?: number
): NextResponse<ApiBody> {
  const status = typeof messageOrStatus === 'number' ? messageOrStatus : (maybeStatus ?? 200);
  const message = typeof messageOrStatus === 'string' ? messageOrStatus : 'Success';
  return NextResponse.json(envelope(message, data), { status });
}

/**
 * 400 Bad Request
 */
export function badRequest(message: string, details?: Record<string, unknown>): NextResponse {
  return NextResponse.json(
    {
      message,
      data: details ? { details } : null,
    } satisfies ApiBody,
    { status: 400 }
  );
}

/**
 * 403 Forbidden
 */
export function forbidden(message: string): NextResponse {
  return NextResponse.json({ message, data: null } satisfies ApiBody, { status: 403 });
}

/**
 * 404 Not Found
 */
export function notFound(message: string): NextResponse {
  return NextResponse.json({ message, data: null } satisfies ApiBody, { status: 404 });
}

/**
 * 204 No Content (success, no body)
 */
export function noContent(_msg: string = 'No content'): NextResponse {
  // 204 responses must not include a body.
  return new NextResponse(null, { status: 204 });
}

/**
 * 409 Conflict
 */
export function conflict(message: string): NextResponse {
  return NextResponse.json({ message, data: null } satisfies ApiBody, { status: 409 });
}

/**
 * 500 Internal Server Error
 */
export function serverError(message: string = 'Internal server error'): NextResponse {
  return NextResponse.json({ message, data: null } satisfies ApiBody, { status: 500 });
}

/**
 * Custom status and body (for one-off responses).
 */
export function json<T>(data: T, status: number, message: string = 'Success'): NextResponse<ApiBody> {
  return NextResponse.json(envelope(message, data), { status });
}
