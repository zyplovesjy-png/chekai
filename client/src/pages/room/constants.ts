/**
 * 座位固化编号（逆时针，底=1）：
 * 俯视牌桌：底 → 右下 → 右 → 右上 → 上 → 左上 → 左 → 左下
 * 1 bottom-0 → 2 right-1 → 3 right-0 → 4 top-1
 * → 5 top-0 → 6 left-1 → 7 left-0 → 8 bottom-1
 * 数组下标 0..7 = 座位号 1..8；下标 +1 = 逆时针下一家。
 */
export const SEAT_IDS = [
  'bottom-0',
  'right-1',
  'right-0',
  'top-1',
  'top-0',
  'left-1',
  'left-0',
  'bottom-1',
] as const;

export const TURN_TIME_SECONDS = 60;

export const MOBILE_TABLE_BREAKPOINT = 600;
