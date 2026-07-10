import { useEffect, useRef } from 'react';
import type { ChipAnimationEvent } from '../pixi/pixiTableTypes';
import { cardBackUrl } from '../cardAssets';
import { playChipSound, playDealSound } from '../sounds';

interface AnimatedLayerProps {
  dealAnim: { key: number; targets: number[] };
  chipAnim: ChipAnimationEvent | null;
  centerMessage: string | null;
  renderDealCards?: boolean;
  onDealComplete?: () => void;
}

/** 桌内公牌锚点（对照茶馆静态稿 tc*，百分比相对 stage） */
const CARD_ANCHORS: Record<number, { left: string; top: string }> = {
  0: { left: '50%', top: '20%' },
  1: { left: '86%', top: '16%' },
  2: { left: '87%', top: '40%' },
  3: { left: '86%', top: '70%' },
  4: { left: '50%', top: '88%' },
  5: { left: '14%', top: '70%' },
  6: { left: '13%', top: '40%' },
  7: { left: '14%', top: '16%' },
};

/** 座位头像锚点 */
const SEAT_ANCHORS: Record<number, { left: string; top: string }> = {
  0: { left: '50%', top: '4%' },
  1: { left: '96%', top: '12%' },
  2: { left: '98%', top: '40%' },
  3: { left: '96%', top: '70%' },
  4: { left: '50%', top: '96%' },
  5: { left: '4%', top: '70%' },
  6: { left: '2%', top: '40%' },
  7: { left: '4%', top: '12%' },
};

/**
 * 座位旁「喊价」落点（桌内靠近头像）
 * 相对座位略向桌心偏移
 */
const SEAT_BET_ANCHORS: Record<number, { left: string; top: string }> = {
  0: { left: '50%', top: '14%' },
  1: { left: '82%', top: '18%' },
  2: { left: '84%', top: '40%' },
  3: { left: '82%', top: '64%' },
  4: { left: '50%', top: '82%' },
  5: { left: '18%', top: '64%' },
  6: { left: '16%', top: '40%' },
  7: { left: '18%', top: '18%' },
};

const POT_ANCHOR = { left: '50%', top: '44%' };
/** 发牌起点：底池正上方牌堆中心（与 .deck-pile top:24% 对齐） */
const DECK_ANCHOR = { left: '50%', top: '24%' };

const CLOCKWISE = [0, 1, 2, 3, 4, 5, 6, 7];
const DEAL_CARD_MS = 280;
const DEAL_GAP_MS = 90;
const CHIP_MS = 550;

function parsePercent(value: string, size: number) {
  return (parseFloat(value) / 100) * size;
}

function resolvePoint(
  kind: ChipAnimationEvent['kind'],
  which: 'from' | 'to',
  anim: ChipAnimationEvent,
): { left: string; top: string } {
  if (kind === 'to_seat_bet') {
    if (which === 'from') return SEAT_ANCHORS[anim.fromVisualSeat ?? 4] || SEAT_ANCHORS[4];
    return SEAT_BET_ANCHORS[anim.toVisualSeat ?? anim.fromVisualSeat ?? 4] || SEAT_BET_ANCHORS[4];
  }
  if (kind === 'to_pot') {
    if (which === 'from') return SEAT_BET_ANCHORS[anim.fromVisualSeat ?? 4] || SEAT_BET_ANCHORS[4];
    return POT_ANCHOR;
  }
  if (kind === 'seat_to_seat') {
    if (which === 'from') return SEAT_BET_ANCHORS[anim.fromVisualSeat ?? 4] || SEAT_BET_ANCHORS[4];
    return SEAT_BET_ANCHORS[anim.toVisualSeat ?? 4] || SEAT_BET_ANCHORS[4];
  }
  // pot_to_seat
  if (which === 'from') return POT_ANCHOR;
  return SEAT_BET_ANCHORS[anim.toVisualSeat ?? 4] || SEAT_BET_ANCHORS[4];
}

/**
 * DOM 动画层：
 * - 发牌：每次 dealing 一轮，按座位顺时针飞
 * - 筹码：下注→座位喊价区；入池/结算→底池或赢家
 */
export function AnimatedLayer({
  dealAnim,
  chipAnim,
  centerMessage,
  renderDealCards = true,
  onDealComplete,
}: AnimatedLayerProps) {
  const fxRef = useRef<HTMLDivElement | null>(null);
  const dealGenRef = useRef(0);
  const onDealCompleteRef = useRef(onDealComplete);
  onDealCompleteRef.current = onDealComplete;

  useEffect(() => {
    if (!renderDealCards || !dealAnim.key || dealAnim.targets.length === 0) return;
    const fx = fxRef.current;
    if (!fx) return;

    const gen = ++dealGenRef.current;
    const stage = fx.getBoundingClientRect();
    const fromX = parsePercent(DECK_ANCHOR.left, stage.width);
    const fromY = parsePercent(DECK_ANCHOR.top, stage.height);
    const order = CLOCKWISE.filter((v) => dealAnim.targets.includes(v));

    let cancelled = false;

    const flyOne = (toV: number, round: number) => new Promise<void>((resolve) => {
      if (cancelled || gen !== dealGenRef.current) {
        resolve();
        return;
      }
      const anchor = CARD_ANCHORS[toV] || CARD_ANCHORS[0];
      const toX = parsePercent(anchor.left, stage.width);
      const toY = parsePercent(anchor.top, stage.height);
      const el = document.createElement('div');
      el.className = 'tea-fly-card';
      el.style.left = `${fromX}px`;
      el.style.top = `${fromY}px`;
      el.style.backgroundImage = `url(${cardBackUrl()})`;
      fx.appendChild(el);
      playDealSound();
      const rot = round % 2 === 0 ? -12 : 14;
      const midX = (toX - fromX) * 0.45 + (Math.random() - 0.5) * 18;
      const midY = (toY - fromY) * 0.35 - 28;
      const anim = el.animate(
        [
          { transform: 'translate(-50%,-50%) scale(0.45) rotate(-8deg)', opacity: 0 },
          {
            transform: `translate(${midX - 10}px, ${midY - 14}px) scale(0.85) rotate(${rot * 0.4}deg)`,
            opacity: 1,
            offset: 0.35,
          },
          {
            transform: `translate(${toX - fromX - 10}px, ${toY - fromY - 14}px) scale(1) rotate(${rot}deg)`,
            opacity: 1,
            offset: 0.85,
          },
          { opacity: 0, offset: 1 },
        ],
        { duration: DEAL_CARD_MS, easing: 'cubic-bezier(.2,.85,.25,1)', fill: 'forwards' },
      );
      anim.onfinish = () => {
        el.remove();
        resolve();
      };
    });

    (async () => {
      for (const seat of order) {
        if (cancelled || gen !== dealGenRef.current) return;
        await flyOne(seat, 0);
        await new Promise((r) => setTimeout(r, DEAL_GAP_MS));
      }
      if (!cancelled && gen === dealGenRef.current) {
        onDealCompleteRef.current?.();
      }
    })();

    return () => {
      cancelled = true;
      fx.querySelectorAll('.tea-fly-card').forEach((n) => n.remove());
    };
  }, [dealAnim.key, renderDealCards]);

  useEffect(() => {
    if (!chipAnim) return;
    const fx = fxRef.current;
    if (!fx) return;
    const stage = fx.getBoundingClientRect();
    const from = resolvePoint(chipAnim.kind, 'from', chipAnim);
    const to = resolvePoint(chipAnim.kind, 'to', chipAnim);
    const fromX = parsePercent(from.left, stage.width);
    const fromY = parsePercent(from.top, stage.height);
    const toX = parsePercent(to.left, stage.width);
    const toY = parsePercent(to.top, stage.height);
    const count = Math.min(6, Math.max(3, Math.ceil((chipAnim.amount || 10) / 20)));

    playChipSound();
    for (let i = 0; i < count; i++) {
      const el = document.createElement('div');
      el.className = 'tea-fly-chip';
      el.style.left = `${fromX}px`;
      el.style.top = `${fromY}px`;
      fx.appendChild(el);
      const jx = (Math.random() - 0.5) * 36;
      const peak = -40 - Math.random() * 24;
      const dx = toX - fromX - 8 + jx;
      const dy = toY - fromY - 8;
      const anim = el.animate(
        [
          { transform: 'translate(-50%,-50%) scale(0.55) rotate(0deg)', opacity: 0 },
          {
            transform: `translate(${dx * 0.4}px, ${dy * 0.35 + peak}px) scale(1.05) rotate(${jx * 0.4}deg)`,
            opacity: 1,
            offset: 0.4,
          },
          {
            transform: `translate(${dx}px, ${dy}px) scale(1) rotate(${jx * 0.2}deg)`,
            opacity: 1,
            offset: 0.82,
          },
          {
            opacity: 0,
            transform: `translate(${dx * 0.98}px, ${dy - 6}px) scale(0.55)`,
          },
        ],
        {
          duration: CHIP_MS,
          delay: i * 48,
          easing: 'cubic-bezier(.18,.78,.22,1)',
          fill: 'forwards',
        },
      );
      anim.onfinish = () => el.remove();
    }
  }, [chipAnim]);

  return (
    <>
      <div className="tea-fx" ref={fxRef} aria-hidden="true" />
      {centerMessage && (
        <div className="center-overlay">
          <div className="center-message">{centerMessage}</div>
        </div>
      )}
    </>
  );
}

/** 估算单轮顺序发牌总时长 */
export function estimateDealDurationMs(seatCount: number) {
  const n = Math.max(1, seatCount);
  return n * (DEAL_CARD_MS + DEAL_GAP_MS) + 120;
}
