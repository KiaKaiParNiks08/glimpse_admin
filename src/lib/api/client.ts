/**
 * Reusable API client with request/response interceptors.
 * Use the default `api` instance or create your own with createApiClient().
 */

import type {
  ApiClientConfig,
  ApiRequestOptions,
  RequestInterceptor,
  ResponseInterceptor,
} from './types';

function resolveUrl(baseURL: string, path: string, params?: ApiRequestOptions['params']): string {
  const url = path.startsWith('http') ? path : `${baseURL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  if (!params) return url;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  const separator = url.includes('?') ? '&' : '?';
  return query ? `${url}${separator}${query}` : url;
}

function buildInit(options: ApiRequestOptions, defaultHeaders: Record<string, string>): RequestInit {
  const { body, headers, ...rest } = options;
  const mergedHeaders: Record<string, string> = { ...defaultHeaders };
  if (headers) {
    const h = headers as Record<string, string>;
    for (const [k, v] of Object.entries(h)) {
      if (v !== undefined) mergedHeaders[k] = v;
    }
  }
  const init: RequestInit = {
    ...rest,
    headers: mergedHeaders,
  };
  if (body !== undefined && body !== null) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return init;
}

export class ApiClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;
  private requestInterceptors: RequestInterceptor[];
  private responseInterceptors: ResponseInterceptor[];

  constructor(config: ApiClientConfig = {}) {
    this.baseURL = config.baseURL ?? (typeof window !== 'undefined' ? '' : '');
    this.defaultHeaders = config.defaultHeaders ?? { 'Content-Type': 'application/json' };
    this.requestInterceptors = config.requestInterceptors ?? [];
    this.responseInterceptors = config.responseInterceptors ?? [];
  }

  async request(path: string, options: ApiRequestOptions = {}): Promise<Response> {
    let url = resolveUrl(this.baseURL, path, options.params);
    let init = buildInit(options, this.defaultHeaders);

    for (const interceptor of this.requestInterceptors) {
      const result = interceptor(url, init);
      [url, init] = await (result instanceof Promise ? result : Promise.resolve(result));
    }

    let response = await fetch(url, init);

    for (const interceptor of this.responseInterceptors) {
      const result = interceptor(response);
      response = await (result instanceof Promise ? result : Promise.resolve(result));
    }

    return response;
  }

  get(path: string, options: ApiRequestOptions = {}): Promise<Response> {
    return this.request(path, { ...options, method: 'GET' });
  }

  post(path: string, body?: unknown, options: ApiRequestOptions = {}): Promise<Response> {
    return this.request(path, { ...options, method: 'POST', body });
  }

  put(path: string, body?: unknown, options: ApiRequestOptions = {}): Promise<Response> {
    return this.request(path, { ...options, method: 'PUT', body });
  }

  patch(path: string, body?: unknown, options: ApiRequestOptions = {}): Promise<Response> {
    return this.request(path, { ...options, method: 'PATCH', body });
  }

  delete(path: string, options: ApiRequestOptions = {}): Promise<Response> {
    return this.request(path, { ...options, method: 'DELETE' });
  }

  /** Add a request interceptor (runs in order). */
  addRequestInterceptor(interceptor: RequestInterceptor): () => void {
    this.requestInterceptors.push(interceptor);
    return () => {
      const i = this.requestInterceptors.indexOf(interceptor);
      if (i !== -1) this.requestInterceptors.splice(i, 1);
    };
  }

  /** Add a response interceptor (runs in order). */
  addResponseInterceptor(interceptor: ResponseInterceptor): () => void {
    this.responseInterceptors.push(interceptor);
    return () => {
      const i = this.responseInterceptors.indexOf(interceptor);
      if (i !== -1) this.responseInterceptors.splice(i, 1);
    };
  }
}

/**
 * Create an API client with optional config and interceptors.
 */
export function createApiClient(config?: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}
