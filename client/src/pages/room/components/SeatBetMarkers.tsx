import type { GamePlayer } from '@/stores/gameStore';
import type { RoomInfo } from '@/stores/roomStore';
import { getVisualIndexForUsername } from '../seatLayout';

interface SeatBetMarkersProps {
  players: GamePlayer[];
  room: RoomInfo | null;
  visualSeats: number[];
  gameStarted: boolean;
  /** 比牌 / 比牌结果展示阶段隐藏喊价 */
  hideForCompare?: boolean;
}

/** 每位玩家当前喊价显示在对应两张牌下方；比牌展示时隐藏，避免挡牌。 */
export function SeatBetMarkers({
  players,
  room,
  visualSeats,
  gameStarted,
  hideForCompare = false,
}: SeatBetMarkersProps) {
  if (!gameStarted || hideForCompare) return null;

  return (
    <>
      {players.map((player) => {
        const amount = player.committed || 0;
        if (amount <= 0 || player.folded || player.eliminated) return null;
        const visualIdx = getVisualIndexForUsername(room, visualSeats, player.username);
        if (visualIdx < 0) return null;
        return (
          <div
            key={player.username}
            className={`tea-seat-bet tea-seat-bet-v${visualIdx}`}
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
