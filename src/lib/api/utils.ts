/**
 * Utilities for API responses: error message extraction, JSON parsing.
 */

/** Standard error body shape from API routes (see api-response.ts) */
export interface ErrorBody {
  error?: string;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Try to get a user-friendly error message from a failed Response.
 * Tries JSON body (error/message) then statusText.
 */
export async function getErrorMessage(res: Response): Promise<string | null> {
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const data = (await res.json()) as ErrorBody;
      return data.error ?? data.message ?? null;
    } catch {
      return null;
    }
  }
  return res.statusText || null;
}

/**
 * Parse response as JSON. Returns null if body is empty or parse fails.
 */
export async function parseJson<T = unknown>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
