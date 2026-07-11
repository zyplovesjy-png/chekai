import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { forceLogout } from '@/utils/sessionGuard';

type MessageHandler = (msg: any) => void;

export function useWebSocket(roomCode: string | null, handlers: Record<string, MessageHandler>) {
  const wsRef = useRef<WebSocket | null>(null);
  const token = useAuthStore((s) => s.token);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const kickedRef = useRef(false);
  const handlersRef = useRef(handlers);
  const roomCodeRef = useRef(roomCode);
  const tokenRef = useRef(token);
  handlersRef.current = handlers;
  roomCodeRef.current = roomCode;
  tokenRef.current = token;

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = undefined;
    }
  }, []);

  const connect = useCallback(() => {
    const code = roomCodeRef.current;
    const tok = tokenRef.current;
    if (!code || !tok || kickedRef.current) return;

    clearReconnectTimer();

    // 先关掉旧连接，避免 iOS PWA 上残留半开 socket
    const prev = wsRef.current;
    if (prev) {
      prev.onclose = null;
      prev.onmessage = null;
      prev.onopen = null;
      prev.onerror = null;
      try { prev.close(); } catch { /* ignore */ }
      wsRef.current = null;
    }

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      ws.send(JSON.stringify({ type: 'join_room', code, token: tok }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'force_logout') {
          kickedRef.current = true;
          clearReconnectTimer();
          forceLogout(msg.msg);
          return;
        }
        const handler = handlersRef.current[msg.type];
        if (handler) handler(msg);
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
      if (kickedRef.current) return;
      clearReconnectTimer();
      reconnectTimer.current = setTimeout(() => connect(), 2000);
    };
  }, [clearReconnectTimer]);

  /** 页面回到前台 / 网络恢复时：断线则重连；仍 OPEN 则补发 join_room 以防服务端侧掉队 */
  const ensureConnected = useCallback(() => {
    if (kickedRef.current || !roomCodeRef.current || !tokenRef.current) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    const ws = wsRef.current;
    if (!ws || ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
      connect();
      return;
    }
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({
          type: 'join_room',
          code: roomCodeRef.current,
          token: tokenRef.current,
        }));
      } catch {
        connect();
      }
    }
  }, [connect]);

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    // 发送失败时立刻尝试重连，下一次操作有机会恢复
    ensureConnected();
    return false;
  }, [ensureConnected]);

  useEffect(() => {
    kickedRef.current = false;
    connect();

    const onResume = () => ensureConnected();
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('pageshow', onResume);
    window.addEventListener('online', onResume);
    window.addEventListener('focus', onResume);

    return () => {
      clearReconnectTimer();
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('pageshow', onResume);
      window.removeEventListener('online', onResume);
      window.removeEventListener('focus', onResume);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onmessage = null;
        wsRef.current.onopen = null;
        wsRef.current.onerror = null;
        try { wsRef.current.close(); } catch { /* ignore */ }
        wsRef.current = null;
      }
    };
  }, [connect, ensureConnected, clearReconnectTimer]);

  return { send, ensureConnected };
}
