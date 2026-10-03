import { NextResponse } from 'next/server';
import { getOpenApiSpec } from '@/lib/openapi';

/**
 * GET /api/docs/openapi
 * Returns the OpenAPI 3.0 spec with server URL set from the request origin
 * so Swagger UI "Try it out" works against the current host.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get('x-forwarded-proto')
    ? `${request.headers.get('x-forwarded-proto')}://${request.headers.get('x-forwarded-host') || url.host}`
    : url.origin;
  const spec = getOpenApiSpec(origin);
  // Swagger UI expects the OpenAPI document at the top-level (must include `openapi`).
  return NextResponse.json(spec, { status: 200 });
}
