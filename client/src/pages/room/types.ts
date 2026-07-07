import type { Card, GamePlayer, RoundRecord } from '@/stores/gameStore';
import type { Member, RoomInfo, SeatPlayer } from '@/stores/roomStore';

export type SeatId =
  | 'top-0'
  | 'top-1'
  | 'right-0'
  | 'right-1'
  | 'bottom-0'
  | 'bottom-1'
  | 'left-0'
  | 'left-1';

export interface VisualSeat {
  physicalIndex: number;
  visualIndex: number;
  seat: SeatPlayer | null;
  player?: GamePlayer;
}

export interface RoomActionHandlers {
  onSit: (visualIndex: number) => void;
  onReady: () => void;
  onStandUp: () => void;
  onStartGame: () => void;
  onLeaveRoom: () => void;
  onDisbandRoom: () => void;
  onGameTypeChange: (gameType: string) => void;
  onPlayerAction: (action: string, amount?: number) => void;
  onAutoSplit: () => void;
  onConfirmSplit: () => void;
  onClearSplitSelection: () => void;
}

export interface RoomRenderContext {
  room: RoomInfo | null;
  myUsername: string;
  currentActor: string | null;
  turnTimer: number;
  visualSeats: number[];
  spectators: Member[];
  viewingRound: number;
  selectedHistoryRound?: RoundRecord;
  myHand: Card[];
}
