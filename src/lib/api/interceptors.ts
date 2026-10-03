/**
 * Built-in request/response interceptors for the API client.
 * Use with api.addRequestInterceptor() / api.addResponseInterceptor() or when creating the client.
 */

import type { RequestInterceptor, ResponseInterceptor } from './types';
import { signOutToLogin } from '@/lib/admin-sign-out';

/**
 * Response interceptor: on 401 Unauthorized, sign out and go to /login (client-side only).
 * Skips redirect for the login endpoint itself.
 */
export const unauthorizedRedirectInterceptor: ResponseInterceptor = (response) => {
  if (typeof window === 'undefined') return response;
  if (response.status !== 401) return response;
  const url = response.url || '';
  if (url.includes('/api/admin/login')) return response;
  void signOutToLogin({
    replace: (href) => {
      window.location.href = href;
    },
  });
  return response;
};

/**
 * Request interceptor: add optional auth/session header from sessionStorage.
 * Use when your API expects a session token or user context in a header.
 */
export function authHeaderInterceptor(sessionKey: string, headerName: string = 'X-Admin-Session'): RequestInterceptor {
  return (url, init) => {
    if (typeof window === 'undefined') return [url, init];
    try {
      const raw = sessionStorage.getItem(sessionKey);
      if (!raw) return [url, init];
      const headers = new Headers(init.headers);
      headers.set(headerName, raw);
      return [url, { ...init, headers }];
    } catch {
      return [url, init];
    }
  };
}

/**
 * Request interceptor: ensure URL is absolute (prepend baseURL when relative).
 */
export function baseURLInterceptor(baseURL: string): RequestInterceptor {
  return (url, init) => {
    if (url.startsWith('http')) return [url, init];
    const base = baseURL.replace(/\/$/, '');
    const path = url.startsWith('/') ? url : `/${url}`;
    return [base + path, init];
  };
}
