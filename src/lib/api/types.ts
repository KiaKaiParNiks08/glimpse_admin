/**
 * API client types: request/response interceptors and options.
 */

export type RequestInterceptor = (
  url: string,
  init: RequestInit
) => Promise<[string, RequestInit]> | [string, RequestInit];

export type ResponseInterceptor = (
  response: Response
) => Promise<Response> | Response;

export interface ApiClientConfig {
  baseURL?: string;
  defaultHeaders?: Record<string, string>;
  requestInterceptors?: RequestInterceptor[];
  responseInterceptors?: ResponseInterceptor[];
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}
