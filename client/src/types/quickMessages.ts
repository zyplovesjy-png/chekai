export interface QuickMessage {
  id: number;
  content: string;
  sortOrder: number;
}

export interface RoomMessage {
  localId: number;
  nickname: string;
  content: string;
}

export type RoomViewMode = 'spectator' | 'joining' | 'player';
