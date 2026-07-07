import type { Graphics } from 'pixi.js';

export function drawFelt(graphics: Graphics, _width: number, _height: number) {
  graphics.clear();
}

export function drawDeck(graphics: Graphics, x: number, y: number) {
  graphics.clear();
  graphics.roundRect(x - 22, y - 29, 44, 58, 7);
  graphics.fill({ color: 0xf1f5f1, alpha: 1 });
  graphics.stroke({ color: 0xff7a3d, width: 2, alpha: 1 });
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
