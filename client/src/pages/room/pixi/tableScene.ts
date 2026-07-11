import type { Container, Graphics } from 'pixi.js';
import { getTableGeometry } from './tableGeometry';
import { drawChip, drawDeck, drawFelt } from './tableTextures';
import type { ChipAnimationEvent, DealAnimationEvent, TableGeometry, TableSize } from './pixiTableTypes';

type TickerCallback = () => void;

export interface PixiRuntime {
  Container: new () => Container;
  Graphics: new () => Graphics;
  ticker: {
    add: (callback: TickerCallback) => void;
    remove: (callback: TickerCallback) => void;
  };
}

export interface PixiTableScene {
  root: Container;
  resize: (size: TableSize) => void;
  playDealAnimation: (event: DealAnimationEvent, reducedMotion: boolean) => void;
  playChipAnimation: (event: ChipAnimationEvent, reducedMotion: boolean) => void;
  destroy: () => void;
}

export function createPixiTableScene(runtime: PixiRuntime): PixiTableScene {
  const root = new runtime.Container();
  const felt = new runtime.Graphics();
  const deck = new runtime.Graphics();
  const potGlow = new runtime.Graphics();
  const animations = new runtime.Container();
  const activeTickerCallbacks = new Set<TickerCallback>();
  let lastGeometry: TableGeometry | null = null;

  root.addChild(felt, potGlow, deck, animations);

  function resize(size: TableSize) {
    const geometry = getTableGeometry(size);
    lastGeometry = geometry;
    drawFelt(felt, size.width, size.height);

    potGlow.clear();

    drawDeck(deck, geometry.deck.x, geometry.deck.y);
  }

  function removeTickerCallback(callback: TickerCallback) {
    if (!activeTickerCallbacks.has(callback)) return;
    runtime.ticker.remove(callback);
    activeTickerCallbacks.delete(callback);
  }

  function playDealAnimation(event: DealAnimationEvent, reducedMotion: boolean) {
    if (reducedMotion || event.targets.length === 0 || !lastGeometry) return;

    const geometry = lastGeometry;
    event.targets.forEach((target, index) => {
      const destination = geometry.seats[target];
      if (!destination) return;

      const card = new runtime.Graphics();
      drawDeck(card, 0, 0);
      card.scale.set(0.5);
      card.position.set(geometry.deck.x, geometry.deck.y);
      animations.addChild(card);

      const start = performance.now() + index * 70;
      const duration = 620;

      const tick: TickerCallback = () => {
        const elapsed = performance.now() - start;
        const progress = Math.min(1, Math.max(0, elapsed / duration));
        const eased = 1 - Math.pow(1 - progress, 3);

        card.position.set(
          geometry.deck.x + (destination.x - geometry.deck.x) * eased,
          geometry.deck.y + (destination.y - geometry.deck.y) * eased,
        );
        card.alpha = 1 - progress;
        card.rotation = (target - 3.5) * 0.03 * progress;

        if (progress >= 1) {
          removeTickerCallback(tick);
          card.destroy();
        }
      };

      activeTickerCallbacks.add(tick);
      runtime.ticker.add(tick);
    });
  }

  function playChipAnimation(event: ChipAnimationEvent, reducedMotion: boolean) {
    if (reducedMotion || !lastGeometry) return;

    const geometry = lastGeometry;
    const seatPoint = (idx?: number) => {
      if (idx == null || idx < 0) return null;
      return geometry.seats[idx] || null;
    };
    const betPoint = (idx?: number) => {
      if (idx == null || idx < 0) return null;
      return geometry.bets[idx] || null;
    };

    let source = geometry.pot;
    let destination = geometry.pot;
    if (event.kind === 'to_seat_bet') {
      source = seatPoint(event.fromVisualSeat) || geometry.pot;
      destination = betPoint(event.toVisualSeat ?? event.fromVisualSeat) || geometry.pot;
    } else if (event.kind === 'to_pot') {
      source = betPoint(event.fromVisualSeat) || seatPoint(event.fromVisualSeat) || geometry.pot;
      destination = geometry.pot;
    } else if (event.kind === 'seat_to_seat') {
      source = betPoint(event.fromVisualSeat) || seatPoint(event.fromVisualSeat) || geometry.pot;
      destination = betPoint(event.toVisualSeat) || seatPoint(event.toVisualSeat) || geometry.pot;
    } else if (event.kind === 'pot_to_seat') {
      source = geometry.pot;
      destination = betPoint(event.toVisualSeat) || seatPoint(event.toVisualSeat) || geometry.pot;
    }

    Array.from({ length: 3 }, (_, index) => index).forEach((index) => {
      const chip = new runtime.Graphics();
      drawChip(chip, 0, 0, 7);
      chip.position.set(source.x, source.y);
      chip.alpha = 0.95;
      animations.addChild(chip);

      const offset = (index - 1) * 9;
      const start = performance.now() + index * 55;
      const duration = 450;

      const tick: TickerCallback = () => {
        const elapsed = performance.now() - start;
        const progress = Math.min(1, Math.max(0, elapsed / duration));
        const eased = 1 - Math.pow(1 - progress, 2);
        const lift = Math.sin(progress * Math.PI) * 22;

        chip.position.set(
          source.x + (destination.x - source.x) * eased + offset * (1 - progress),
          source.y + (destination.y - source.y) * eased - lift,
        );
        chip.scale.set(1 - progress * 0.18);
        chip.alpha = 0.95 - progress * 0.35;

        if (progress >= 1) {
          removeTickerCallback(tick);
          chip.destroy();
        }
      };

      activeTickerCallbacks.add(tick);
      runtime.ticker.add(tick);
    });
  }

  function destroy() {
    activeTickerCallbacks.forEach((callback) => runtime.ticker.remove(callback));
    activeTickerCallbacks.clear();
    root.destroy({ children: true });
  }

  return {
    root,
    resize,
    playDealAnimation,
    playChipAnimation,
    destroy,
  };
}
