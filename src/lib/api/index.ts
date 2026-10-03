/**
 * Reusable API client and default instance.
 *
 * Usage:
 *   import { api, getErrorMessage } from '@/lib/api';
 *   const res = await api.get('/api/users');
 *   if (!res.ok) throw new Error(await getErrorMessage(res) ?? 'Request failed');
 *   const data = await res.json();
 *
 * For custom clients with interceptors:
 *   import { createApiClient, unauthorizedRedirectInterceptor } from '@/lib/api';
 *   const client = createApiClient({
 *     baseURL: process.env.NEXT_PUBLIC_API_URL,
 *     responseInterceptors: [unauthorizedRedirectInterceptor],
 *   });
 */

export { ApiClient, createApiClient } from './client';
export { getErrorMessage, parseJson } from './utils';
export type { ErrorBody } from './utils';
export {
  unauthorizedRedirectInterceptor,
  authHeaderInterceptor,
  baseURLInterceptor,
} from './interceptors';
export type {
  ApiClientConfig,
  ApiRequestOptions,
  RequestInterceptor,
  ResponseInterceptor,
} from './types';

import { createApiClient } from './client';
import { unauthorizedRedirectInterceptor } from './interceptors';

/** Default API client with 401 → /login redirect. Use for all app API calls. */
export const api = createApiClient({
  defaultHeaders: { 'Content-Type': 'application/json' },
  responseInterceptors: [unauthorizedRedirectInterceptor],
});
