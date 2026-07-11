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
  handlersRef.current = handlers;

  const connect = useCallback(() => {
    if (!roomCode || !token || kickedRef.current) return;

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join_room', code: roomCode, token }));
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'force_logout') {
          kickedRef.current = true;
          if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
          forceLogout(msg.msg);
          return;
        }
        const handler = handlersRef.current[msg.type];
        if (handler) handler(msg);
      } catch {}
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (kickedRef.current) return;
      reconnectTimer.current = setTimeout(() => connect(), 3000);
    };
  }, [roomCode, token]);

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    kickedRef.current = false;
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { send };
}
