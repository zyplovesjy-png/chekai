import type { GamePlayer } from '@/stores/gameStore';
import type { RoomInfo } from '@/stores/roomStore';
import { getVisualIndexForUsername } from '../seatLayout';

/** 桌面靠近头像的喊价落点（与 AnimatedLayer SEAT_BET_ANCHORS 一致） */
const SEAT_BET_POS: Record<number, { left: string; top: string }> = {
  0: { left: '50%', top: '14%' },
  1: { left: '82%', top: '18%' },
  2: { left: '84%', top: '40%' },
  3: { left: '82%', top: '64%' },
  4: { left: '50%', top: '82%' },
  5: { left: '18%', top: '64%' },
  6: { left: '16%', top: '40%' },
  7: { left: '18%', top: '18%' },
};

interface SeatBetMarkersProps {
  players: GamePlayer[];
  room: RoomInfo | null;
  visualSeats: number[];
  gameStarted: boolean;
}

/** 每位玩家当前喊价显示在桌面靠近头像处 */
export function SeatBetMarkers({ players, room, visualSeats, gameStarted }: SeatBetMarkersProps) {
  if (!gameStarted) return null;

  return (
    <>
      {players.map((player) => {
        const amount = player.committed || 0;
        if (amount <= 0 || player.folded || player.eliminated) return null;
        const visualIdx = getVisualIndexForUsername(room, visualSeats, player.username);
        if (visualIdx < 0) return null;
        const pos = SEAT_BET_POS[visualIdx];
        if (!pos) return null;
        return (
          <div
            key={player.username}
            className={`tea-seat-bet tea-seat-bet-v${visualIdx}`}
            style={{ left: pos.left, top: pos.top }}
            aria-label={`${player.nickname}喊价${amount}`}
          >
            <i className="tea-seat-bet-chip" aria-hidden="true" />
            <span className="tea-seat-bet-amt">{amount}</span>
          </div>
        );
      })}
    </>
  );
}
