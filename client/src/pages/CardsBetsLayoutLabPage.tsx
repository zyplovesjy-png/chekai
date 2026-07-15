import {
  useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type PointerEvent as ReactPointerEvent,
} from 'react';
import { Link } from 'react-router-dom';
import type { Card } from '@/stores/gameStore';
import { CardView } from '@/pages/room/components/CardView';
import {
  CARD_CENTERS,
  CARDS_BOX,
  FELT,
} from '@/pages/room/tableLayout';
import './layoutLab.css';

type Box = { x: number; y: number; w: number; h: number };

const STORAGE_KEY = 'chekai-cards-bets-lab-v2';
const NAMES = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
const CARD_ASPECT = 34 / 50;
const DEFAULT_CARD = { w: 34, h: 50 };
const MAX_CARD_H = 70; // 不超过自己手牌高度

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function mockCard(id: string, rank: string, suit: string, color: string): Card {
  return { id, color, rank, cnName: rank, cnChar: rank, cardPoints: 0, order: 0, suit };
}
const SAMPLE: Card[] = [
  mockCard('bA', 'A', '♠', 'black'),
  mockCard('rK', 'K', '♥', 'red'),
  mockCard('b7', '7', '♣', 'black'),
  mockCard('r3', '3', '♦', 'red'),
];

function rectToBox(el: DOMRect, parent: DOMRect): Box | null {
  if (parent.width < 8 || parent.height < 8 || el.width < 1 || el.height < 1) return null;
  return {
    x: round4((el.left - parent.left) / parent.width),
    y: round4((el.top - parent.top) / parent.height),
    w: round4(el.width / parent.width),
    h: round4(el.height / parent.height),
  };
}

type Overrides = Record<string, Box>;
type DragState = {
  id: string;
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  box: Box;
  pw: number;
  ph: number;
};

function applyFelt(el: HTMLElement, box: Box) {
  const left = `${box.x * 100}%`;
  const top = `${box.y * 100}%`;
  const w = `${box.w * 100}%`;
  const h = `${box.h * 100}%`;
  el.style.setProperty('--lab-left', left);
  el.style.setProperty('--lab-top', top);
  el.style.setProperty('--lab-w', w);
  el.style.setProperty('--lab-h', h);
  el.classList.add('overridden');
  el.style.setProperty('left', left, 'important');
  el.style.setProperty('top', top, 'important');
  el.style.setProperty('width', w, 'important');
  el.style.setProperty('height', h, 'important');
  el.style.setProperty('right', 'auto', 'important');
  el.style.setProperty('bottom', 'auto', 'important');
  el.style.setProperty('transform', 'none', 'important');
}

function applyBet(el: HTMLElement, box: Box) {
  el.classList.add('overridden');
  el.style.position = 'absolute';
  el.style.left = `${(box.x + box.w / 2) * 100}%`;
  el.style.top = `${(box.y + box.h / 2) * 100}%`;
  el.style.width = `${box.w * 100}%`;
  el.style.height = `${box.h * 100}%`;
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  el.style.transform = 'translate(-50%, -50%)';
}

function applyCards(el: HTMLElement, box: Box) {
  el.classList.add('overridden');
  el.style.position = 'absolute';
  el.style.left = `${box.x * 100}%`;
  el.style.top = `${box.y * 100}%`;
  el.style.width = `${box.w * 100}%`;
  el.style.height = `${box.h * 100}%`;
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  el.style.transform = 'none';
}

function labelOf(id: string) {
  if (id === 'felt') return '桌布';
  if (id === 'cardSize') return '公牌尺寸';
  const m = id.match(/^(cards|bet)-(\d)$/);
  if (!m) return id;
  return `${m[1] === 'cards' ? '公牌' : '喊价'}${m[2]}·${NAMES[Number(m[2])]}`;
}

/** 精简实验室：只调牌桌 / 公牌位置尺寸 / 喊价 */
export default function CardsBetsLayoutLabPage() {
  const phoneRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const feltRef = useRef<HTMLDivElement>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [cardSlot, setCardSlot] = useState(DEFAULT_CARD);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [compareMode, setCompareMode] = useState(true);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { overrides?: Overrides; cardSlot?: { w: number; h: number } };
      if (parsed.cardSlot?.w && parsed.cardSlot?.h) {
        setCardSlot({
          w: clamp(Math.round(parsed.cardSlot.w), 20, 48),
          h: clamp(Math.round(parsed.cardSlot.h), 28, MAX_CARD_H),
        });
      }
      const cleaned: Overrides = {};
      for (const [id, box] of Object.entries(parsed.overrides || {})) {
        if (!box || box.w < 0.02 || box.h < 0.02) continue;
        if (id.startsWith('bet-') && box.x < 0.05 && box.y < 0.05) continue;
        cleaned[id] = box;
      }
      setOverrides(cleaned);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ overrides, cardSlot }));
  }, [overrides, cardSlot]);

  const parentRect = useCallback(() => stageRef.current?.getBoundingClientRect(), []);

  const setBox = useCallback((id: string, box: Box) => {
    setOverrides((prev) => ({
      ...prev,
      [id]: {
        x: round4(clamp(box.x, -0.2, 1.2)),
        y: round4(clamp(box.y, -0.2, 1.2)),
        w: round4(clamp(box.w, 0.02, 1.2)),
        h: round4(clamp(box.h, 0.02, 1.2)),
      },
    }));
  }, []);

  const styleFor = (id: string, base?: CSSProperties): CSSProperties | undefined => {
    const box = overrides[id];
    if (!box) return base;
    if (id === 'felt') {
      return {
        ...base,
        ['--lab-left' as string]: `${box.x * 100}%`,
        ['--lab-top' as string]: `${box.y * 100}%`,
        ['--lab-w' as string]: `${box.w * 100}%`,
        ['--lab-h' as string]: `${box.h * 100}%`,
      };
    }
    if (id.startsWith('bet-')) {
      return {
        ...base,
        position: 'absolute',
        left: `${(box.x + box.w / 2) * 100}%`,
        top: `${(box.y + box.h / 2) * 100}%`,
        width: `${box.w * 100}%`,
        height: `${box.h * 100}%`,
        right: 'auto',
        bottom: 'auto',
        transform: 'translate(-50%, -50%)',
      };
    }
    if (id.startsWith('cards-')) {
      return {
        ...base,
        position: 'absolute',
        left: `${box.x * 100}%`,
        top: `${box.y * 100}%`,
        width: 'auto',
        height: 'auto',
        minHeight: `${box.h * 100}%`,
        right: 'auto',
        bottom: 'auto',
        transform: 'none',
      };
    }
    return base;
  };

  const syncCardSizeFromResize = useCallback((box: Box, ph: number, pw: number) => {
    // 比牌两排时容器高度 ≈ 2*牌高 + gap；对局中一排则直接用高度
    const rawH = box.h * ph;
    const h = clamp(
      Math.round(compareMode ? (rawH - 3) / 2 : rawH),
      28,
      MAX_CARD_H,
    );
    const w = clamp(Math.round(h * CARD_ASPECT), 20, 48);
    setCardSlot({ w, h });
    const cardsPerRow = compareMode ? 2 : 2;
    const rows = compareMode ? 2 : 1;
    const groupW = round4((w * cardsPerRow + 3 * (cardsPerRow - 1)) / pw);
    const groupH = round4((h * rows + (rows > 1 ? 3 : 0)) / ph);
    setOverrides((prev) => {
      const next = { ...prev };
      for (let v = 0; v < 8; v++) {
        const id = `cards-${v}`;
        const cur = next[id];
        if (!cur) continue;
        next[id] = { ...cur, w: groupW, h: groupH };
      }
      return next;
    });
  }, [compareMode]);

  const onPointerDown = (e: ReactPointerEvent, id: string, mode: 'move' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();
    const el = phoneRef.current?.querySelector(`[data-lab-id="${id}"]`) as HTMLElement | null;
    const parent = parentRect();
    if (!el || !parent || parent.width < 8) return;
    const measured = rectToBox(el.getBoundingClientRect(), parent);
    if (!measured) return;
    setSelectedId(id);
    if (id === 'felt') applyFelt(el, measured);
    else if (id.startsWith('bet-')) applyBet(el, measured);
    else applyCards(el, measured);
    setBox(id, measured);
    dragRef.current = {
      id, mode, startX: e.clientX, startY: e.clientY,
      box: { ...measured }, pw: parent.width, ph: parent.height,
    };
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (e.clientX - d.startX) / d.pw;
      const dy = (e.clientY - d.startY) / d.ph;
      const b = { ...d.box };
      if (d.mode === 'move') {
        b.x = d.box.x + dx;
        b.y = d.box.y + dy;
      } else {
        b.w = Math.max(0.04, d.box.w + dx);
        b.h = Math.max(0.04, d.box.h + dy);
      }
      const el = phoneRef.current?.querySelector(`[data-lab-id="${d.id}"]`) as HTMLElement | null;
      if (el) {
        if (d.id === 'felt') applyFelt(el, b);
        else if (d.id.startsWith('bet-')) applyBet(el, b);
        else applyCards(el, b);
      }
      setBox(d.id, b);
      if (d.mode === 'resize' && d.id.startsWith('cards-')) {
        syncCardSizeFromResize(b, d.ph, d.pw);
      }
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [setBox, syncCardSizeFromResize]);

  const measureAll = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return null;
    const stageR = stage.getBoundingClientRect();
    const read = (id: string) => {
      const el = phoneRef.current?.querySelector(`[data-lab-id="${id}"]`) as HTMLElement | null;
      if (!el) return null;
      return rectToBox(el.getBoundingClientRect(), stageR);
    };
    const felt = read('felt');
    const seats = [0, 1, 2, 3, 4, 5, 6, 7].map((v) => {
      const cards = read(`cards-${v}`);
      const bet = read(`bet-${v}`);
      return {
        visual: v,
        cards,
        bet,
        cardsCenter: cards
          ? { x: round4(cards.x + cards.w / 2), y: round4(cards.y + cards.h / 2) }
          : null,
        betCenter: bet
          ? { x: round4(bet.x + bet.w / 2), y: round4(bet.y + bet.h / 2) }
          : null,
      };
    });
    return {
      version: 1,
      source: 'cards-bets-layout-lab',
      exportedAt: new Date().toISOString(),
      meta: {
        phoneW: Math.round(phoneRef.current?.getBoundingClientRect().width || 0),
        phoneH: Math.round(phoneRef.current?.getBoundingClientRect().height || 0),
        stageW: Math.round(stageR.width),
        stageH: Math.round(stageR.height),
      },
      cardSlotPx: { ...cardSlot },
      felt,
      seats,
      overrides,
    };
  }, [cardSlot, overrides]);

  const exportJson = useCallback(() => {
    const payload = measureAll();
    const text = JSON.stringify(payload, null, 2);
    setJsonText(text);
    return text;
  }, [measureAll]);

  const itemIds = useMemo(
    () => ['felt', ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap((v) => [`cards-${v}`, `bet-${v}`])],
    [],
  );

  const labClass = (id: string) =>
    `lab-hit${selectedId === id ? ' selected' : ''}${overrides[id] ? ' overridden' : ''}`;

  const feltStyle: CSSProperties = styleFor('felt', {
    ['--lab-left' as string]: `${FELT.x * 100}%`,
    ['--lab-top' as string]: `${FELT.y * 100}%`,
    ['--lab-w' as string]: `${FELT.w * 100}%`,
    ['--lab-h' as string]: `${FELT.h * 100}%`,
  }) || {};

  const cardsCount = compareMode ? 4 : 2;

  const renderCardGroup = (count: number) => {
    if (count === 4) {
      const head = SAMPLE.slice(0, 2);
      const tail = SAMPLE.slice(2, 4);
      return (
        <>
          <div className="pub-row">
            {head.map((card, i) => (
              <div className="card-slot" key={`h${i}`}>
                <CardView card={card} size="small" />
              </div>
            ))}
          </div>
          <div className="pub-row">
            {tail.map((card, i) => (
              <div className="card-slot" key={`t${i}`}>
                <CardView card={card} size="small" />
              </div>
            ))}
          </div>
        </>
      );
    }
    return SAMPLE.slice(0, count).map((card, i) => (
      <div className="card-slot" key={i}>
        <CardView card={card} size="small" />
      </div>
    ));
  };

  return (
    <div className="layout-lab-page">
      <aside className="layout-lab-panel">
        <header>
          <h1>公牌 / 喊价实验室</h1>
          <p>
            只含牌桌、公牌、喊价（顶栏/操作区为占位，与现网舞台比例一致）。
            比牌默认<strong>上下两排（上头下尾）</strong>。
            拖位置；拖公牌角可改全局公牌尺寸。调完导出 JSON。
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link className="lab-back" to="/lobby">← 回大厅</Link>
            <Link className="lab-back" to="/layout-lab">完整布局实验室</Link>
          </div>
        </header>

        <div className="lab-tools">
          <button
            type="button"
            className="primary"
            onClick={() => {
              const text = exportJson();
              const blob = new Blob([text], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'cards-bets-layout.json';
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            导出 JSON
          </button>
          <button type="button" onClick={() => { navigator.clipboard?.writeText(exportJson()); }}>
            复制
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              setOverrides({});
              setCardSlot(DEFAULT_CARD);
              localStorage.removeItem(STORAGE_KEY);
              setSelectedId(null);
              setJsonText('');
              window.location.reload();
            }}
          >
            恢复默认
          </button>
          <label>
            <input
              type="checkbox"
              checked={compareMode}
              onChange={(e) => setCompareMode(e.target.checked)}
            />
            比牌四张（上头下尾，与现网一致）
          </label>
        </div>

        <div className="lab-insp">
          <h2>公牌尺寸（全局）</h2>
          <div className="lab-fields">
            <label>
              宽 px
              <input
                type="number"
                min={20}
                max={48}
                value={cardSlot.w}
                onChange={(e) => {
                  const w = clamp(Number(e.target.value) || 34, 20, 48);
                  const h = clamp(Math.round(w / CARD_ASPECT), 28, MAX_CARD_H);
                  setCardSlot({ w, h });
                }}
              />
            </label>
            <label>
              高 px
              <input
                type="number"
                min={28}
                max={MAX_CARD_H}
                value={cardSlot.h}
                onChange={(e) => {
                  const h = clamp(Number(e.target.value) || 50, 28, MAX_CARD_H);
                  const w = clamp(Math.round(h * CARD_ASPECT), 20, 48);
                  setCardSlot({ w, h });
                }}
              />
            </label>
          </div>
          <p style={{ fontSize: '0.62rem', color: '#8a93a3', margin: '0 0 10px' }}>
            手牌参考 48×70；当前公牌 {cardSlot.w}×{cardSlot.h}
          </p>

          <h2>组件 {selectedId ? `· ${labelOf(selectedId)}` : ''}</h2>
          <div className="lab-list">
            {itemIds.map((id) => (
              <button
                key={id}
                type="button"
                className={`${selectedId === id ? 'on' : ''}${overrides[id] ? ' dirty' : ''}`}
                onClick={() => setSelectedId(id)}
              >
                {labelOf(id)}
              </button>
            ))}
          </div>
          <textarea className="lab-json" readOnly value={jsonText} placeholder="导出后显示 JSON…" />
        </div>
      </aside>

      <div className="layout-lab-preview">
        <div
          className={`lab-phone room-page tea-room cards-bets-lab${compareMode ? ' lab-phase-compare' : ''}`}
          ref={phoneRef}
          style={{
            ['--lab-pub-w' as string]: `${cardSlot.w}px`,
            ['--lab-pub-h' as string]: `${cardSlot.h}px`,
          }}
        >
          <header className="tea-top lab-chrome-top" aria-hidden>
            <div className="tea-brand">
              <span className="tea-code">LAB</span>
              <span className="tea-meta">布局占位</span>
              <span className="tea-phase">舞台对齐</span>
            </div>
          </header>

          <main className="game-area tea-stage lab-stage-only" ref={stageRef}>
            <div
              className={`table-felt tea-felt ${labClass('felt')}`}
              ref={feltRef}
              data-lab-id="felt"
              style={feltStyle}
            >
              <button
                type="button"
                className="lab-felt-handle"
                onPointerDown={(e) => onPointerDown(e, 'felt', 'move')}
              >
                拖桌面
              </button>
              <i className="lab-resize" onPointerDown={(e) => onPointerDown(e, 'felt', 'resize')} />
              <div className="deck-pile" aria-hidden>
                <div className="deck-stack">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div className="deck-count">26</div>
              </div>
              <div className="pot tea-pot">
                <div className="chip-stack" aria-hidden><i /><i /><i /><i /></div>
                <div className="pot-badge"><span className="pot-value">80</span></div>
              </div>
            </div>

            {[0, 1, 2, 3, 4, 5, 6, 7].map((v) => {
              const box = CARDS_BOX[v];
              const cardsBase: CSSProperties = {
                left: `${box.x * 100}%`,
                top: `${box.y * 100}%`,
              };
              const bet = CARD_CENTERS[v];
              return (
                <div key={v}>
                  <div
                    className={`public-cards public-cards-vpos-${v} ${compareMode ? 'split2' : ''} ${labClass(`cards-${v}`)}`}
                    data-lab-id={`cards-${v}`}
                    style={styleFor(`cards-${v}`, cardsBase)}
                    onPointerDown={(e) => onPointerDown(e, `cards-${v}`, 'move')}
                  >
                    <span className="lab-tag">公牌{v}</span>
                    {renderCardGroup(cardsCount)}
                    <i className="lab-resize" onPointerDown={(e) => onPointerDown(e, `cards-${v}`, 'resize')} />
                  </div>

                  <div
                    className={`tea-seat-bet tea-seat-bet-v${v} ${labClass(`bet-${v}`)}`}
                    data-lab-id={`bet-${v}`}
                    style={styleFor(`bet-${v}`, {
                      left: bet.left,
                      top: bet.top,
                      transform: 'translate(-50%, -50%)',
                    })}
                    onPointerDown={(e) => onPointerDown(e, `bet-${v}`, 'move')}
                  >
                    <span className="lab-tag">喊价{v}</span>
                    <i className="tea-seat-bet-chip" aria-hidden />
                    <span className="tea-seat-bet-amt">{10 + v * 5}</span>
                    <i className="lab-resize" onPointerDown={(e) => onPointerDown(e, `bet-${v}`, 'resize')} />
                  </div>
                </div>
              );
            })}
          </main>

          <footer className="tea-hud lab-chrome-hud" aria-hidden>
            <div className="lab-chrome-hud-inner">操作区占位（与现网同高，不参与拖拽）</div>
          </footer>
        </div>
      </div>
    </div>
  );
}
