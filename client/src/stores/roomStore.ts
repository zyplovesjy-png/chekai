import { create } from 'zustand';

export interface Member {
  username: string;
  nickname: string;
  ready: boolean;
  disconnected?: boolean;
  avatar_path?: string;
}

export interface SeatPlayer {
  username: string;
  nickname: string;
  buyIn: number;
  ready?: boolean;
  avatar_path?: string;
}

export interface RoomInfo {
  code: string;
  name: string;
  host: string;
  creator: string;
  /** 创建时选定的对局时长（分钟） */
  durationMinutes: number;
  /** 服务端预计结束时间（ms）；未开局为 null */
  endsAt: number | null;
  /** 累计加时（分钟） */
  extendedMinutes?: number;
  minBuyIn: number;
  members: Member[];
  seats: (SeatPlayer | null)[];
  gameStarted: boolean;
  gameRound: number;
  /** 房主暂停中 */
  paused?: boolean;
  /** 本局结束后结算 */
  endAfterHand?: boolean;
  /** 整场已结束 / 后台标记解散 */
  disbanded?: boolean;
  /** 终局结算快照（disbanded 时可能附带） */
  lastSettlement?: {
    settlement: Array<{
      username: string;
      nickname: string;
      initial: number;
      final: number;
      delta: number;
    }>;
    reason?: string;
    potSplit?: {
      pot: number;
      recipientCount?: number;
      base?: number;
      remainder?: number;
      shares?: Record<string, number>;
    } | null;
  } | null;
  createdAt: number;
}

interface RoomState {
  room: RoomInfo | null;
  setRoom: (room: RoomInfo) => void;
  clear: () => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  room: null,
  setRoom: (room) => set({ room }),
  clear: () => set({ room: null }),
}));

export const DURATION_OPTIONS = [
  { value: 30, label: '30 分钟' },
  { value: 60, label: '1 小时' },
  { value: 120, label: '2 小时' },
  { value: 180, label: '3 小时' },
  { value: 240, label: '4 小时' },
] as const;

export const EXTEND_OPTIONS = [
  { value: 15, label: '+15 分钟' },
  { value: 30, label: '+30 分钟' },
  { value: 60, label: '+1 小时' },
] as const;

export function formatDurationLabel(minutes?: number | null) {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} 分钟`;
  const h = minutes / 60;
  return Number.isInteger(h) ? `${h} 小时` : `${minutes} 分钟`;
}

/** 剩余时间 HH:MM:SS 或 MM:SS */
export function formatCountdown(endsAt?: number | null, now = Date.now()) {
  if (!endsAt) return '--:--';
  const remain = Math.max(0, Math.floor((endsAt - now) / 1000));
  const h = Math.floor(remain / 3600);
  const m = Math.floor((remain % 3600) / 60);
  const s = remain % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}
