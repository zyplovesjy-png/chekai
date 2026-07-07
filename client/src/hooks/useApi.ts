import { useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';

export function useApi() {
  const token = useAuthStore((s) => s.token);

  return useCallback(async (url: string, opts: RequestInit = {}) => {
    const res = await fetch(url, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...opts.headers,
      },
    });
    return res.json();
  }, [token]);
}

export async function apiUpload(url: string, formData: FormData, token: string) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: formData,
  });
  return res.json();
}
