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
  roundLimit: number;
  minBuyIn: number;
  members: Member[];
  seats: (SeatPlayer | null)[];
  gameType: string;
  gameStarted: boolean;
  gameRound: number;
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
