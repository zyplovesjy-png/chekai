/**
 * 桌面布局坐标（来自 cards-bets-layout.json，舞台含 HUD 占位后导出）。
 * seats / cards / bets：相对 stage；deck / pot：相对 felt。
 */

export type PctPoint = { left: string; top: string };

const pct = (n: number) => `${+(n * 100).toFixed(2)}%`;

/** 桌布（相对 stage） */
export const FELT = { x: 0.1518, y: 0.07, w: 0.7, h: 0.8 };

/** 公牌单张像素 */
export const CARD_SLOT_PX = { w: 34, h: 50 };

/** 座位包围盒左上角（相对 stage） */
export const SEAT_BOX = [
  { x: 0.4529, y: -0.02, w: 0.0942, h: 0.1007 },
  { x: 0.88, y: 0.2, w: 0.0942, h: 0.1007 },
  { x: 0.88, y: 0.44, w: 0.0942, h: 0.1007 },
  { x: 0.88, y: 0.7, w: 0.0942, h: 0.1007 },
  { x: 0.4529, y: 0.8934, w: 0.0942, h: 0.1007 },
  { x: 0.02, y: 0.7, w: 0.0942, h: 0.1007 },
  { x: 0.02, y: 0.44, w: 0.0942, h: 0.1007 },
  { x: 0.02, y: 0.2, w: 0.0942, h: 0.1007 },
] as const;

/** 公牌包围盒左上角（相对 stage） */
export const CARDS_BOX = [
  { x: 0.4372, y: 0.0887, w: 0.1243, h: 0.1565 },
  { x: 0.698, y: 0.1942, w: 0.1243, h: 0.1565 },
  { x: 0.6945, y: 0.4326, w: 0.1243, h: 0.1565 },
  { x: 0.6944, y: 0.6699, w: 0.1243, h: 0.1565 },
  { x: 0.4511, y: 0.8295, w: 0.1243, h: 0.1565 },
  { x: 0.1915, y: 0.6745, w: 0.1243, h: 0.1565 },
  { x: 0.1879, y: 0.4342, w: 0.1243, h: 0.1565 },
  { x: 0.1862, y: 0.1926, w: 0.1243, h: 0.1565 },
] as const;

const SEAT_CENTER_N = [
  { x: 0.5, y: 0.0304 },
  { x: 0.9271, y: 0.2504 },
  { x: 0.9271, y: 0.4904 },
  { x: 0.9271, y: 0.7504 },
  { x: 0.5, y: 0.9438 },
  { x: 0.0671, y: 0.7504 },
  { x: 0.0671, y: 0.4904 },
  { x: 0.0671, y: 0.2504 },
] as const;

const CARDS_CENTER_N = [
  { x: 0.4994, y: 0.1669 },
  { x: 0.7602, y: 0.2725 },
  { x: 0.7567, y: 0.5109 },
  { x: 0.7566, y: 0.7482 },
  { x: 0.5133, y: 0.9078 },
  { x: 0.2537, y: 0.7528 },
  { x: 0.2501, y: 0.5125 },
  { x: 0.2484, y: 0.2709 },
] as const;

const BET_CENTER_N = [
  { x: 0.4983, y: 0.1919 },
  { x: 0.7566, y: 0.2925 },
  { x: 0.7566, y: 0.5298 },
  { x: 0.7566, y: 0.7723 },
  { x: 0.5082, y: 0.7977 },
  { x: 0.2508, y: 0.7723 },
  { x: 0.2506, y: 0.5335 },
  { x: 0.2489, y: 0.2912 },
] as const;

/** 动画 / 标记用中心点（相对 stage） */
export const SEAT_CENTERS: Record<number, PctPoint> = Object.fromEntries(
  SEAT_CENTER_N.map((p, i) => [i, { left: pct(p.x), top: pct(p.y) }]),
);

export const CARD_CENTERS: Record<number, PctPoint> = Object.fromEntries(
  CARDS_CENTER_N.map((p, i) => [i, { left: pct(p.x), top: pct(p.y) }]),
);

export const BET_CENTERS: Record<number, PctPoint> = Object.fromEntries(
  BET_CENTER_N.map((p, i) => [i, { left: pct(p.x), top: pct(p.y) }]),
);

/** 牌堆 / 底池中心（相对 felt） */
export const DECK_IN_FELT: PctPoint = { left: '49.74%', top: '32.32%' };
export const POT_IN_FELT: PctPoint = { left: '49.74%', top: '50.17%' };

/** 牌堆 / 底池中心（相对 stage，供 AnimatedLayer） */
export const DECK_ON_STAGE: PctPoint = {
  left: pct(FELT.x + 0.4974 * FELT.w),
  top: pct(FELT.y + 0.3232 * FELT.h),
};
export const POT_ON_STAGE: PctPoint = {
  left: pct(FELT.x + 0.4974 * FELT.w),
  top: pct(FELT.y + 0.5017 * FELT.h),
};
