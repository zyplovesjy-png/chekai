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
      storage: {
        getItem: (key) => {
          const val = sessionStorage.getItem(key);
          return val ? JSON.parse(val) : null;
        },
        setItem: (key, val) => sessionStorage.setItem(key, JSON.stringify(val)),
        removeItem: (key) => sessionStorage.removeItem(key),
      },
    }
  )
);
