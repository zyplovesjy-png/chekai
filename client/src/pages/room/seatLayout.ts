import type { RoomInfo } from '@/stores/roomStore';

export function calcSeatRotation(room: RoomInfo | null, myUsername: string) {
  if (!room) return { shift: 0, visualSeats: Array.from({ length: 8 }, (_, i) => i) };

  let playerPhysIdx = -1;
  for (let i = 0; i < 8; i++) {
    if (room.seats[i]?.username === myUsername) {
      playerPhysIdx = i;
      break;
    }
  }

  if (playerPhysIdx < 0) {
    return { shift: 0, visualSeats: Array.from({ length: 8 }, (_, i) => i) };
  }

  const shift = (playerPhysIdx - 4 + 8) % 8;
  return { shift, visualSeats: Array.from({ length: 8 }, (_, visualIndex) => (visualIndex + shift) % 8) };
}

export function getVisualIndexForUsername(room: RoomInfo | null, visualSeats: number[], username: string) {
  const physicalIndex = room?.seats?.findIndex((seat) => seat?.username === username) ?? -1;
  if (physicalIndex < 0) return -1;
  return visualSeats.indexOf(physicalIndex);
}
