import { NextResponse } from 'next/server';
import { z, ZodError } from 'zod';
import { badRequest } from '@/lib/api-response';

/**
 * Parse and validate request body with a Zod schema.
 * Returns [null, errorResponse] on validation failure, [data, null] on success.
 */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<[T, null] | [null, NextResponse]> {
  try {
    const raw = await request.json();
    const data = schema.parse(raw) as T;
    return [data, null];
  } catch (err) {
    if (err instanceof ZodError) {
      return [null, badRequest('Validation failed', err.flatten().fieldErrors)];
    }
    return [null, badRequest('Invalid JSON')];
  }
}

/**
 * Parse and validate URL search params with a Zod schema.
 */
export function parseQuery<T>(
  searchParams: URLSearchParams,
  schema: z.ZodType<T>
): [T, null] | [null, NextResponse] {
  try {
    const raw = Object.fromEntries(searchParams.entries());
    const data = schema.parse(raw) as T;
    return [data, null];
  } catch (err) {
    if (err instanceof ZodError) {
      return [null, badRequest('Invalid query params', err.flatten().fieldErrors)];
    }
    return [null, badRequest('Invalid query')];
  }
}

/**
 * Parse path/route params (e.g. from dynamic segment).
 */
export function parseParams<T>(
  params: Record<string, string | undefined>,
  schema: z.ZodType<T>
): [T, null] | [null, NextResponse] {
  try {
    const data = schema.parse(params) as T;
    return [data, null];
  } catch (err) {
    if (err instanceof ZodError) {
      return [null, badRequest('Invalid path params', err.flatten().fieldErrors)];
    }
    return [null, badRequest('Invalid params')];
  }
}
