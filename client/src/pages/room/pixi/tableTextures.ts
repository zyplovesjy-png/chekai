import type { Graphics } from 'pixi.js';

export function drawDeck(graphics: Graphics, x: number, y: number) {
  graphics.clear();
  // 叠三层牌背，贴近 DOM 牌堆视觉
  const layers = [
    { dx: -4, dy: 3, rot: -0.08 },
    { dx: -1, dy: 1, rot: -0.02 },
    { dx: 2, dy: 0, rot: 0.05 },
  ];
  layers.forEach((layer, index) => {
    const lx = x + layer.dx;
    const ly = y + layer.dy;
    graphics.roundRect(lx - 16, ly - 23, 32, 46, 4);
    graphics.fill({ color: index === 2 ? 0x3a2818 : 0x2a1c12, alpha: 0.95 - index * 0.05 });
    graphics.stroke({ color: 0xe0c06a, width: 1, alpha: 0.35 + index * 0.1 });
  });
}

export function drawChip(graphics: Graphics, x: number, y: number, radius = 8) {
  graphics.clear();
  graphics.circle(x, y, radius);
  graphics.fill({ color: 0xc73b34, alpha: 1 });
  graphics.stroke({ color: 0xf7fcff, width: 2, alpha: 0.98 });
  graphics.circle(x, y, radius * 0.58);
  graphics.stroke({ color: 0xf1d36b, width: 2, alpha: 0.95 });
  graphics.circle(x, y, radius * 0.25);
  graphics.fill({ color: 0xf7fcff, alpha: 0.95 });
}
