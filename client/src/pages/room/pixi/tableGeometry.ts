import type { TableGeometry, TableSize } from './pixiTableTypes';

const seatRatios = [
  { x: 0.5, y: 0.055 },
  { x: 0.885, y: 0.14 },
  { x: 0.885, y: 0.39 },
  { x: 0.885, y: 0.64 },
  { x: 0.5, y: 0.84 },
  { x: 0.115, y: 0.64 },
  { x: 0.115, y: 0.39 },
  { x: 0.115, y: 0.14 },
];

export function getTableGeometry(size: TableSize): TableGeometry {
  const width = Math.max(1, size.width);
  const height = Math.max(1, size.height);
  const center = { x: width * 0.5, y: height * 0.48 };

  return {
    center,
    feltRadiusX: Math.max(116, Math.min((width - 144) / 2, 165)),
    feltRadiusY: Math.max(167, Math.min(height * 0.29, 208)),
    deck: { x: center.x, y: height * 0.23 },
    pot: { x: center.x, y: height * 0.47 },
    seats: seatRatios.map((point) => ({ x: width * point.x, y: height * point.y })),
  };
}
