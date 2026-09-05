/**
 * Auth helper: get current user from localStorage session.
 *
 * Usage in client components:
 *   const { user, loading } = useCurrentUser();
 *
 * Usage in plain functions (inside event handlers):
 *   const user = await getCurrentUser();
 */

import { useEffect, useState } from 'react';

export interface CurrentUser {
  id: number;
  username: string;
  real_name: string;
  role: 'teacher' | 'student' | 'admin' | 'assistant';
  student_level: string | null;
  class_id: number | null;
  token?: string;
}

const AUTH_KEY = 'tracinglight_user';

let cachedUser: CurrentUser | null = null;

export function clearUserCache() {
  cachedUser = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(AUTH_KEY);
    document.cookie = 'tracinglight_token=; path=/; max-age=0';
  }
}

/** Get current user from localStorage (client-side, callable anywhere) */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (typeof window === 'undefined') return null;
  if (cachedUser) return cachedUser;

  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    cachedUser = JSON.parse(raw) as CurrentUser;
    return cachedUser;
  } catch {
    return null;
  }
}

/** React hook to get current user + loading state */
export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getCurrentUser().then((u) => {
      if (!cancelled) {
        setUser(u);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  return { user, loading };
}

/** Sign out and clear all state */
export async function signOut() {
  clearUserCache();
  if (typeof window !== 'undefined') {
    window.location.href = '/';
  }
}
