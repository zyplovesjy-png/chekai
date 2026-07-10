import type { RoomInfo } from '@/stores/roomStore';

/**
 * 座位数组下标 0..7 = 座位号 1..8（底=1，逆时针：底→右→上→左）。
 * 视觉位：v0=上, v1=右上, v2=右, v3=右下, v4=下(自己), v5=左下, v6=左, v7=左上。
 *
 * 映射使「下标增大」在画面上沿逆时针走：
 * 自己在下方(v4)时：v4→0, v3→1, v2→2, v1→3, v0→4, v7→5, v6→6, v5→7
 */
export function calcSeatRotation(room: RoomInfo | null, myUsername: string) {
  const mapForPlayer = (playerPhysIdx: number) => ({
    shift: playerPhysIdx,
    // visual → physical：从自己座位逆时针展开
    visualSeats: Array.from({ length: 8 }, (_, visualIndex) =>
      (playerPhysIdx + 4 - visualIndex + 8) % 8
    ),
  });

  if (!room) return mapForPlayer(0);

  let playerPhysIdx = -1;
  for (let i = 0; i < 8; i++) {
    if (room.seats[i]?.username === myUsername) {
      playerPhysIdx = i;
      break;
    }
  }

  if (playerPhysIdx < 0) return mapForPlayer(0);
  return mapForPlayer(playerPhysIdx);
}

export function getVisualIndexForUsername(room: RoomInfo | null, visualSeats: number[], username: string) {
  const physicalIndex = room?.seats?.findIndex((seat) => seat?.username === username) ?? -1;
  if (physicalIndex < 0) return -1;
  return visualSeats.indexOf(physicalIndex);
}
