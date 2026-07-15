import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  username: string;
  nickname: string;
  avatar_path?: string;
  role?: 'admin' | 'player';
}

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  setUser: (user: Partial<User>) => void;
  clear: () => void;
}

let memoryAuthValue: unknown = null;

/**
 * 部分手机浏览器（尤其隐私模式/鸿蒙 WebView）会拒绝 sessionStorage，
 * 甚至可能留下无法 JSON.parse 的半截数据。认证 store 不能因此阻断 React 启动。
 */
const safeSessionStorage = {
  getItem: (key: string) => {
    try {
      const val = window.sessionStorage.getItem(key);
      if (!val) return memoryAuthValue;
      try {
        const parsed = JSON.parse(val);
        memoryAuthValue = parsed;
        return parsed;
      } catch {
        window.sessionStorage.removeItem(key);
        memoryAuthValue = null;
        return null;
      }
    } catch {
      return memoryAuthValue;
    }
  },
  setItem: (key: string, val: unknown) => {
    memoryAuthValue = val;
    try {
      window.sessionStorage.setItem(key, JSON.stringify(val));
    } catch {
      // 内存兜底仍可维持当前页面会话。
    }
  },
  removeItem: (key: string) => {
    memoryAuthValue = null;
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      setUser: (partial) =>
        set((s) => (s.user ? { user: { ...s.user, ...partial } } : {})),
      clear: () => set({ token: null, user: null }),
    }),
    {
      name: 'chekai-auth',
      storage: safeSessionStorage,
    }
  )
);
