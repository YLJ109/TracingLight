'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { apiFetch } from './api-fetch';

interface Notification {
  id: number;
  type: 'assignment' | 'grade' | 'system';
  title: string;
  message: string;
  time: string;
  read: boolean;
  link?: string;
}

interface NotificationCtx {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (n: Omit<Notification, 'id' | 'time' | 'read'>) => void;
  markAllRead: () => void;
  markRead: (id: number) => void;
  toast: (title: string, message: string) => void;
}

const Ctx = createContext<NotificationCtx>({
  notifications: [], unreadCount: 0,
  addNotification: () => {}, markAllRead: () => {}, markRead: () => {},
  toast: () => {},
});

const STORAGE_KEY = 'tracinglight_notifications';

function loadStored(): Notification[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persist(ns: Notification[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ns)); } catch {}
}

let idCounter = Date.now();

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>(loadStored);

  useEffect(() => { persist(notifications); }, [notifications]);

  // 从后端拉取真实通知
  useEffect(() => {
    apiFetch('/api/notifications')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          const remote = json.data.map((n: any) => ({
            id: n.id, type: n.type, title: n.title, message: n.message,
            link: n.link, read: n.read, time: n.time,
          }));
          setNotifications((prev) => {
            const localToasts = prev.filter((n) => n.id > 1000000000);
            return [...localToasts, ...remote];
          });
        }
      })
      .catch(() => {});
  }, []);

  const addNotification = useCallback((n: Omit<Notification, 'id' | 'time' | 'read'>) => {
    const newN: Notification = {
      ...n, id: ++idCounter,
      time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      read: false,
    };
    setNotifications(prev => [newN, ...prev].slice(0, 50));
  }, []);

  const markRead = useCallback((id: number) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    apiFetch('/api/notifications', { method: 'POST', body: JSON.stringify({ id }) }).catch(() => {});
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    apiFetch('/api/notifications', { method: 'POST', body: JSON.stringify({ all: true }) }).catch(() => {});
  }, []);

  const toast = useCallback((title: string, message: string) => {
    addNotification({ type: 'system', title, message });
    // Browser notification
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body: message });
    }
  }, [addNotification]);

  // Request notification permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <Ctx.Provider value={{ notifications, unreadCount, addNotification, markAllRead, markRead, toast }}>
      {children}
    </Ctx.Provider>
  );
}

export function useNotifications() {
  return useContext(Ctx);
}
