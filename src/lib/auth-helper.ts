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
  avatar_url?: string;
  token?: string;
}

const AUTH_KEY = 'tracinglight_user';
const USER_UPDATED_EVENT = 'tracinglight:user-updated';

let cachedUser: CurrentUser | null = null;

/**
 * 更新当前用户头像：同步内存缓存 + localStorage，并广播「用户信息已更新」事件，
 * 供侧栏/布局等跨页组件实时刷新（它们不会随路由重挂载）。
 */
export function setUserAvatar(url: string) {
  if (typeof window === 'undefined' || !url) return;
  const raw = localStorage.getItem(AUTH_KEY);
  const stored = raw ? JSON.parse(raw) : {};
  const updated = { ...stored, avatar_url: url };
  localStorage.setItem(AUTH_KEY, JSON.stringify(updated));
  cachedUser = { ...stored, avatar_url: url } as CurrentUser;
  window.dispatchEvent(new CustomEvent(USER_UPDATED_EVENT, { detail: { avatarUrl: url } }));
}

export const USER_UPDATED_EVENT_NAME = USER_UPDATED_EVENT;

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
