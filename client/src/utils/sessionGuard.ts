import { useAuthStore } from '@/stores/authStore';

const FORCE_LOGOUT_MSG = '账号已在其他设备登录';

/** 被其他端顶号：清本地登录态并回登录页 */
export function forceLogout(message?: string) {
  const msg = message || FORCE_LOGOUT_MSG;
  try {
    useAuthStore.getState().clear();
  } catch { /* ignore */ }
  if (typeof window === 'undefined') return;
  const path = window.location.pathname || '';
  if (path !== '/login') {
    try {
      sessionStorage.setItem('chekai-force-logout-msg', msg);
    } catch { /* ignore */ }
    window.location.replace('/login');
  }
}

export function consumeForceLogoutMessage(): string | null {
  try {
    const msg = sessionStorage.getItem('chekai-force-logout-msg');
    if (msg) sessionStorage.removeItem('chekai-force-logout-msg');
    return msg;
  } catch {
    return null;
  }
}

export function isSessionReplacedPayload(data: any): boolean {
  return !!(
    data
    && (data.code === 'SESSION_REPLACED'
      || data.type === 'force_logout'
      || (typeof data.msg === 'string' && data.msg.includes('其他设备')))
  );
}
