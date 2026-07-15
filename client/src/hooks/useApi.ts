import { useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { forceLogout, isSessionReplacedPayload } from '@/utils/sessionGuard';

export function useApi() {
  const token = useAuthStore((s) => s.token);

  return useCallback(async (url: string, opts: RequestInit = {}) => {
    let res: Response;
    try {
      res = await fetch(url, {
        ...opts,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
          ...opts.headers,
        },
      });
    } catch {
      return { ok: false, networkError: true, status: 0, msg: '网络连接失败，请稍后重试' };
    }
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      data = { ok: false, msg: '请求失败' };
    }
    data = data && typeof data === 'object' ? data : { ok: false, msg: '请求失败' };
    data.status = res.status;
    // 登录接口本身的 401 不触发顶号跳转
    if (url !== '/api/login' && (res.status === 401 || isSessionReplacedPayload(data))) {
      forceLogout(data?.msg || '登录已失效，请重新登录');
    }
    return data;
  }, [token]);
}

export async function apiUpload(url: string, formData: FormData, token: string) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: formData,
    });
  } catch {
    return { ok: false, networkError: true, status: 0, msg: '网络连接失败，请稍后重试' };
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = { ok: false, msg: '上传失败' };
  }
  data = data && typeof data === 'object' ? data : { ok: false, msg: '上传失败' };
  data.status = res.status;
  if (res.status === 401 || isSessionReplacedPayload(data)) {
    forceLogout(data?.msg || '登录已失效，请重新登录');
  }
  return data;
}
