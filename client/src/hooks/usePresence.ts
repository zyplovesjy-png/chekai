import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { forceLogout } from '@/utils/sessionGuard';

export type LobbyPresenceData = {
  onlineCount: number;
  roomCount: number;
  rooms?: any[];
};

/** 大厅 presence：保持在线，并接收房间列表实时推送 */
export function usePresence(onUpdate?: (data: LobbyPresenceData) => void) {
  const token = useAuthStore((s) => s.token);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onUpdateRef = useRef(onUpdate);
  const kickedRef = useRef(false);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!token) return;
    kickedRef.current = false;

    const connect = () => {
      if (kickedRef.current) return;
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'presence', token }));
        timerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'presence', token }));
          }
        }, 25000);
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'force_logout') {
            kickedRef.current = true;
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
            if (timerRef.current) clearInterval(timerRef.current);
            forceLogout(msg.msg);
            return;
          }
          if (msg.type === 'presence_ok' || msg.type === 'lobby_update') {
            onUpdateRef.current?.({
              onlineCount: msg.onlineCount ?? 0,
              roomCount: msg.roomCount ?? 0,
              rooms: Array.isArray(msg.rooms) ? msg.rooms : undefined,
            });
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (timerRef.current) clearInterval(timerRef.current);
        if (kickedRef.current) return;
        reconnectRef.current = setTimeout(connect, 4000);
      };
    };

    connect();
    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [token]);
}
