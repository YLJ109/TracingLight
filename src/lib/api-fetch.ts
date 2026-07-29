/**
 * Unified API fetch wrapper — auto-injects JWT for server auth.
 * Reads token from localStorage tracinglight_user (REST API login).
 */
function getAuthHeadersSync(): HeadersInit {
  try {
    const stored = localStorage.getItem('tracinglight_user');
    if (stored) {
      const user = JSON.parse(stored);
      if (user.token) {
        return { Authorization: `Bearer ${user.token}` };
      }
    }
  } catch {
    // SSR or localStorage not available
  }
  return {};
}

export async function apiFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const authHeaders = getAuthHeadersSync();

  const headers = new Headers(options?.headers);
  if (authHeaders && 'Authorization' in authHeaders) {
    headers.set('Authorization', (authHeaders as Record<string, string>).Authorization);
  }
  // Default to JSON if no Content-Type set
  if (!headers.has('Content-Type') && options?.method !== 'GET') {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(url, { ...options, headers });
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
