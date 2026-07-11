import { useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { forceLogout, isSessionReplacedPayload } from '@/utils/sessionGuard';

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
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = { ok: false, msg: '请求失败' };
    }
    // 登录接口本身的 401 不触发顶号跳转
    if (url !== '/api/login' && (res.status === 401 || isSessionReplacedPayload(data))) {
      if (isSessionReplacedPayload(data) || data?.code === 'SESSION_REPLACED') {
        forceLogout(data?.msg);
      }
    }
    return data;
  }, [token]);
}

export async function apiUpload(url: string, formData: FormData, token: string) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token },
    body: formData,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = { ok: false, msg: '上传失败' };
  }
  if (res.status === 401 || isSessionReplacedPayload(data)) {
    if (isSessionReplacedPayload(data) || data?.code === 'SESSION_REPLACED') {
      forceLogout(data?.msg);
    }
  }
  return data;
}
