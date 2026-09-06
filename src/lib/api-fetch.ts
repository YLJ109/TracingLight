/**
 * Unified API fetch wrapper.
 *
 * 会话安全：JWT 仅存于 httpOnly `tracinglight_token` cookie（登录时服务端种入），
 * 浏览器同源请求自动携带，这里不再从 localStorage 读取/注入 token，杜绝 XSS 窃取。
 */
export async function apiFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const headers = new Headers(options?.headers);
  // Default to JSON if no Content-Type set（FormData 除外：浏览器会自动设置 multipart boundary）
  if (!headers.has('Content-Type') && options?.method !== 'GET' && !(options?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(url, { ...options, headers, credentials: 'same-origin' });
}

/** Convenience wrappers */
export async function apiGet(url: string): Promise<Response> {
  return apiFetch(url);
}

export async function apiPost(url: string, body?: unknown): Promise<Response> {
  return apiFetch(url, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}
