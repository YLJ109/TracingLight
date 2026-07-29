'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

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
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
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
