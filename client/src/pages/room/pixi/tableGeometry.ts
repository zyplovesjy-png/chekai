import type { TableGeometry, TableSize } from './pixiTableTypes';
import {
  BET_CENTERS,
  DECK_ON_STAGE,
  FELT,
  POT_ON_STAGE,
  SEAT_CENTERS,
} from '../tableLayout';

function parsePct(value: string): number {
  return parseFloat(value) / 100;
}

/** 座位中心（相对 stage，table-layout.json） */
const seatRatios = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
  x: parsePct(SEAT_CENTERS[i].left),
  y: parsePct(SEAT_CENTERS[i].top),
}));

const betRatios = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
  x: parsePct(BET_CENTERS[i].left),
  y: parsePct(BET_CENTERS[i].top),
}));

export function getTableGeometry(size: TableSize): TableGeometry {
  const width = Math.max(1, size.width);
  const height = Math.max(1, size.height);
  const center = {
    x: width * (FELT.x + FELT.w / 2),
    y: height * (FELT.y + FELT.h / 2),
  };

  return {
    center,
    feltRadiusX: Math.max(116, (width * FELT.w) / 2),
    feltRadiusY: Math.max(167, (height * FELT.h) / 2),
    deck: {
      x: width * parsePct(DECK_ON_STAGE.left),
      y: height * parsePct(DECK_ON_STAGE.top),
    },
    pot: {
      x: width * parsePct(POT_ON_STAGE.left),
      y: height * parsePct(POT_ON_STAGE.top),
    },
    seats: seatRatios.map((point) => ({ x: width * point.x, y: height * point.y })),
    bets: betRatios.map((point) => ({ x: width * point.x, y: height * point.y })),
  };
}
