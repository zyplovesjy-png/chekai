import {
  useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type PointerEvent as ReactPointerEvent,
} from 'react';
import { Link } from 'react-router-dom';
import type { Card } from '@/stores/gameStore';
import { Avatar } from '@/pages/room/components/PlayerSeat';
import { CardView } from '@/pages/room/components/CardView';
import { ActionBar } from '@/pages/room/components/ActionBar';
import { RoomChromeIcons } from '@/components/AppChromeIcons';
import { cardBackUrl } from '@/pages/room/cardAssets';
import './layoutLab.css';

type Box = { x: number; y: number; w: number; h: number };
type Space = 'stage' | 'felt' | 'hud' | 'phone';

const STORAGE_KEY = 'chekai-client-layout-lab-v3';
const NAMES = ['北', '东北', '东', '东南', '我', '西南', '西', '西北'];

const BET_POS: Record<number, CSSProperties> = {
  0: { left: '50%', top: '14%', transform: 'translate(-50%, -50%)' },
  1: { left: '82%', top: '18%', transform: 'translate(-50%, -50%)' },
  2: { left: '84%', top: '40%', transform: 'translate(-50%, -50%)' },
  3: { left: '82%', top: '64%', transform: 'translate(-50%, -50%)' },
  4: { left: '50%', top: '82%', transform: 'translate(-50%, -50%)' },
  5: { left: '18%', top: '64%', transform: 'translate(-50%, -50%)' },
  6: { left: '16%', top: '40%', transform: 'translate(-50%, -50%)' },
  7: { left: '18%', top: '18%', transform: 'translate(-50%, -50%)' },
};

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function mockCard(id: string, rank: string, suit: string, color: string): Card {
  return { id, color, rank, cnName: rank, cnChar: rank, cardPoints: 0, order: 0, suit };
}
const MY_HAND: Card[] = [
  mockCard('bQ1', 'Q', 'black', 'black'),
  mockCard('r81', '8', 'red', 'red'),
  mockCard('b31', '3', 'black', 'black'),
  mockCard('bJ2', 'J', 'black', 'black'),
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

function overrideStyle(box: Box): CSSProperties {
  // 注意：不要写 inset（简写会覆盖 left/top，元素会飞到左上角）
  return {
    position: 'absolute',
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.w * 100}%`,
    height: `${box.h * 100}%`,
    right: 'auto',
    bottom: 'auto',
    transform: 'none',
    ['--lab-left' as string]: `${box.x * 100}%`,
    ['--lab-top' as string]: `${box.y * 100}%`,
    ['--lab-w' as string]: `${box.w * 100}%`,
    ['--lab-h' as string]: `${box.h * 100}%`,
  };
}

/** 直接写 DOM，避开 React 批量更新导致的一帧跳动；桌面规则带 !important */
function applyBoxToDom(el: HTMLElement, box: Box, kind: 'felt' | 'hud' | 'bet' | 'default' = 'default') {
  const left = `${box.x * 100}%`;
  const top = `${box.y * 100}%`;
  const w = `${box.w * 100}%`;
  const h = `${box.h * 100}%`;
  el.style.setProperty('--lab-left', left);
  el.style.setProperty('--lab-top', top);
  el.style.setProperty('--lab-w', w);
  el.style.setProperty('--lab-h', h);
  el.classList.add('overridden');

  // 操作区必须留在 grid 流式布局里，只改高度；绝对定位会让牌桌占满并重叠
  if (kind === 'hud' || el.classList.contains('tea-hud')) {
    el.style.position = '';
    el.style.left = '';
    el.style.top = '';
    el.style.right = '';
    el.style.bottom = '';
    el.style.width = '';
    el.style.transform = '';
    el.style.flexShrink = '0';
    el.style.height = h;
    el.style.minHeight = '140px';
    el.style.maxHeight = '55%';
    return;
  }

  if (kind === 'felt') {
    el.style.setProperty('left', left, 'important');
    el.style.setProperty('top', top, 'important');
    el.style.setProperty('width', w, 'important');
    el.style.setProperty('height', h, 'important');
    el.style.setProperty('right', 'auto', 'important');
    el.style.setProperty('bottom', 'auto', 'important');
    el.style.setProperty('transform', 'none', 'important');
    return;
  }

  // 喊价：按中心点写，保留 translate 居中
  if (kind === 'bet' || el.classList.contains('tea-seat-bet')) {
    const cx = `${(box.x + box.w / 2) * 100}%`;
    const cy = `${(box.y + box.h / 2) * 100}%`;
    el.style.position = 'absolute';
    el.style.left = cx;
    el.style.top = cy;
    el.style.width = w;
    el.style.height = h;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.transform = 'translate(-50%, -50%)';
    return;
  }

  el.style.position = 'absolute';
  el.style.left = left;
  el.style.top = top;
  el.style.width = w;
  el.style.height = h;
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  el.style.transform = 'none';
}

function applyKindFor(id: string): 'felt' | 'hud' | 'bet' | 'default' {
  if (id === 'felt') return 'felt';
  if (id === 'hud') return 'hud';
  if (id.startsWith('bet-')) return 'bet';
  return 'default';
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

function labelOf(id: string) {
  const map: Record<string, string> = {
    felt: '桌面', deck: '牌堆', pot: '底池', hud: '操作区高度',
    selfTimer: '倒计时条', selfRow: '自己信息', myHand: '自己手牌', actionBar: '操作按钮',
  };
  if (map[id]) return map[id];
  const m = id.match(/^(seat|cards|bet)-(\d)$/);
  if (!m) return id;
  const kind = { seat: '座位', cards: '公牌', bet: '喊价' }[m[1]];
  return `${kind}${m[2]}·${NAMES[Number(m[2])]}`;
}

export default function LayoutLabPage() {
  const phoneRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const feltRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLElement>(null);

  /** 只有用户拖过的项才会写入；未写入的继续用现网 CSS */
  const [overrides, setOverrides] = useState<Overrides>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [barMode, setBarMode] = useState<'open' | 'raised' | 'split' | 'lobby' | 'idle'>('open');
  const [raiseAmount, setRaiseAmount] = useState('10');
  const [jsonText, setJsonText] = useState('');
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Overrides;
      // 清掉坏覆盖
      const cleaned: Overrides = {};
      for (const [id, box] of Object.entries(parsed || {})) {
        if (!box) continue;
        if (box.w < 0.03 || box.h < 0.03) continue;
        if (box.x === 0 && box.y === 0 && (box.w < 0.2 || box.h < 0.2)) continue;
        // 旧版喊价若贴在左上角则丢弃
        if (id.startsWith('bet-') && box.x < 0.08 && box.y < 0.08) continue;
        cleaned[id] = box;
      }
      setOverrides(cleaned);
    } catch { /* ignore */ }
  }, []);

  const spaceOf = useCallback((id: string): Space => {
    if (id === 'deck' || id === 'pot') return 'felt';
    if (id === 'hud') return 'phone';
    if (id === 'selfTimer' || id === 'selfRow' || id === 'myHand' || id === 'actionBar') return 'hud';
    return 'stage';
  }, []);

  const parentRect = useCallback((space: Space) => {
    if (space === 'felt') return feltRef.current?.getBoundingClientRect();
    if (space === 'hud') return hudRef.current?.getBoundingClientRect();
    if (space === 'phone') return phoneRef.current?.getBoundingClientRect();
    return stageRef.current?.getBoundingClientRect();
  }, []);

  const ensureBox = useCallback((id: string): Box | null => {
    if (overrides[id]) return overrides[id];
    const el = phoneRef.current?.querySelector(`[data-lab-id="${id}"]`) as HTMLElement | null;
    const parent = parentRect(spaceOf(id));
    if (!el || !parent) return null;
    return rectToBox(el.getBoundingClientRect(), parent);
  }, [overrides, parentRect, spaceOf]);

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
    // 公牌：部分座位用 translateX(-50%) 居中，覆盖时按包围盒左上角写，去掉 transform
    if (id.startsWith('cards-')) {
      return {
        ...base,
        position: 'absolute',
        left: `${box.x * 100}%`,
        top: `${box.y * 100}%`,
        width: `${box.w * 100}%`,
        height: `${box.h * 100}%`,
        right: 'auto',
        bottom: 'auto',
        transform: 'none',
      };
    }
    // 喊价：覆盖时仍用中心锚点，避免飞到左上角
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
    return { ...base, ...overrideStyle(box) };
  };

  const onPointerDown = (e: ReactPointerEvent, id: string, mode: 'move' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();
    const el = phoneRef.current?.querySelector(`[data-lab-id="${id}"]`) as HTMLElement | null;
    const parent = parentRect(spaceOf(id));
    if (!el || !parent || parent.width < 8 || parent.height < 8) return;

    // 始终从「当前屏幕上的真实位置」起算，避免用到坏掉的旧覆盖值
    const measured = rectToBox(el.getBoundingClientRect(), parent);
    if (!measured) return;

    setSelectedId(id);
    applyBoxToDom(el, measured, applyKindFor(id));
    setBox(id, measured);

    dragRef.current = {
      id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      box: { ...measured },
      pw: parent.width,
      ph: parent.height,
    };
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (e.clientX - d.startX) / d.pw;
      const dy = (e.clientY - d.startY) / d.ph;
      const b = { ...d.box };
      if (d.id === 'hud') {
        // 只改高度，保持贴底流式布局（不要 absolute）
        // 把手上拖 / 右下角下拖：都按“拉高操作区”直觉
        const delta = d.mode === 'resize' ? dy : -dy;
        b.h = clamp(d.box.h + delta, 0.16, 0.55);
        b.x = 0;
        b.y = 1 - b.h;
        b.w = 1;
      } else if (d.mode === 'move') {
        b.x = d.box.x + dx;
        b.y = d.box.y + dy;
      } else {
        b.w = Math.max(0.04, d.box.w + dx);
        b.h = Math.max(0.04, d.box.h + dy);
      }
      const el = phoneRef.current?.querySelector(`[data-lab-id="${d.id}"]`) as HTMLElement | null;
      if (el) applyBoxToDom(el, b, applyKindFor(d.id));
      setBox(d.id, b);
    };
    const up = () => { dragRef.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [setBox]);

  const measureAll = useCallback(() => {
    const phone = phoneRef.current;
    const stage = stageRef.current;
    const felt = feltRef.current;
    const hud = hudRef.current;
    if (!phone || !stage || !felt || !hud) return null;

    const stageR = stage.getBoundingClientRect();
    const feltR = felt.getBoundingClientRect();
    const hudR = hud.getBoundingClientRect();
    const phoneR = phone.getBoundingClientRect();

    const read = (id: string, parent: DOMRect) => {
      const el = phone.querySelector(`[data-lab-id="${id}"]`) as HTMLElement | null;
      if (!el) return null;
      // 已有覆盖用覆盖，否则测 DOM
      if (overrides[id]) return overrides[id];
      return rectToBox(el.getBoundingClientRect(), parent);
    };

    const seats = [];
    for (let v = 0; v < 8; v++) {
      seats.push({
        visual: v,
        seat: read(`seat-${v}`, stageR),
        cards: read(`cards-${v}`, stageR),
        bet: read(`bet-${v}`, stageR),
        seatCenter: null as null | { x: number; y: number },
        cardsCenter: null as null | { x: number; y: number },
        betCenter: null as null | { x: number; y: number },
      });
      const s = seats[v];
      if (s.seat) s.seatCenter = { x: round4(s.seat.x + s.seat.w / 2), y: round4(s.seat.y + s.seat.h / 2) };
      if (s.cards) s.cardsCenter = { x: round4(s.cards.x + s.cards.w / 2), y: round4(s.cards.y + s.cards.h / 2) };
      if (s.bet) s.betCenter = { x: round4(s.bet.x + s.bet.w / 2), y: round4(s.bet.y + s.bet.h / 2) };
    }

    const deck = read('deck', feltR);
    const pot = read('pot', feltR);
    const feltBox = read('felt', stageR);
    const hudH = overrides.hud?.h ?? round4(hudR.height / phoneR.height);

    return {
      version: 1 as const,
      source: 'client-layout-lab',
      exportedAt: new Date().toISOString(),
      meta: {
        phoneW: Math.round(phoneR.width),
        phoneH: Math.round(phoneR.height),
        stageW: Math.round(stageR.width),
        stageH: Math.round(stageR.height),
      },
      coordinateSpaces: {
        felt: 'stage',
        deck: 'felt',
        pot: 'felt',
        seats: 'stage',
        hudChildren: 'hud',
        hudHeight: 'phone',
      },
      felt: feltBox,
      deck,
      pot,
      seats,
      hud: {
        height: hudH,
        selfTimer: read('selfTimer', hudR),
        selfRow: read('selfRow', hudR),
        myHand: read('myHand', hudR),
        actionBar: read('actionBar', hudR),
      },
      anchors: {
        deckCenter: deck ? { x: round4(deck.x + deck.w / 2), y: round4(deck.y + deck.h / 2) } : null,
        potCenter: pot ? { x: round4(pot.x + pot.w / 2), y: round4(pot.y + pot.h / 2) } : null,
      },
      overrides,
    };
  }, [overrides]);

  const exportJson = useCallback(() => {
    const payload = measureAll();
    const text = JSON.stringify(payload, null, 2);
    setJsonText(text);
    return text;
  }, [measureAll]);

  const itemIds = useMemo(() => [
    'felt', 'deck', 'pot',
    ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap((v) => [`seat-${v}`, `cards-${v}`, `bet-${v}`]),
    'hud', 'selfTimer', 'selfRow', 'myHand', 'actionBar',
  ], []);

  const selectedBox = selectedId ? (overrides[selectedId] || ensureBox(selectedId)) : null;

  const actionProps = {
    open: {
      phase: 'betting1', isMyTurn: true, isBetting: true, betStarted: false,
      currentBet: 0, minBet: 10, maxBet: 9999, playerChips: 200, playerRoundCommitted: 0,
      canShowSanhua: true, selectedCount: 0, splitConfirmed: false,
      canHostStart: false, canReady: false, isReady: false,
    },
    raised: {
      phase: 'betting1', isMyTurn: true, isBetting: true, betStarted: true,
      currentBet: 20, minBet: 10, maxBet: 9999, playerChips: 200, playerRoundCommitted: 10,
      canShowSanhua: false, selectedCount: 0, splitConfirmed: false,
      canHostStart: false, canReady: false, isReady: false,
    },
    split: {
      phase: 'selecting', isMyTurn: true, isBetting: false, betStarted: false,
      currentBet: 0, minBet: 10, maxBet: 9999, playerChips: 200, playerRoundCommitted: 0,
      canShowSanhua: false, selectedCount: 2, splitConfirmed: false,
      canHostStart: false, canReady: false, isReady: false,
    },
    lobby: {
      phase: 'idle', isMyTurn: false, isBetting: false, betStarted: false,
      currentBet: 0, minBet: 10, maxBet: 9999, playerChips: 200, playerRoundCommitted: 0,
      canShowSanhua: false, selectedCount: 0, splitConfirmed: false,
      canHostStart: true, canReady: false, isReady: false,
    },
    idle: {
      phase: 'betting1', isMyTurn: false, isBetting: true, betStarted: true,
      currentBet: 20, minBet: 10, maxBet: 9999, playerChips: 200, playerRoundCommitted: 0,
      canShowSanhua: false, selectedCount: 0, splitConfirmed: false,
      canHostStart: false, canReady: false, isReady: false,
    },
  }[barMode];

  const labClass = (id: string) =>
    `lab-hit${selectedId === id ? ' selected' : ''}${overrides[id] ? ' overridden' : ''}`;

  return (
    <div className="layout-lab-page">
      <aside className="layout-lab-panel">
        <header>
          <h1>客户端布局实验室</h1>
          <p>
            右侧是<strong>现网房间页同款布局</strong>。默认不改位；点选后拖拽才会覆盖该组件。
            调完导出 JSON。
          </p>
          <Link className="lab-back" to="/lobby">← 回大厅</Link>
          <Link className="lab-back" to="/layout-lab-cards" style={{ marginLeft: 12 }}>公牌/喊价实验室 →</Link>
        </header>
        <div className="lab-tools">
          <button type="button" className="primary" onClick={() => {
            const text = exportJson();
            const blob = new Blob([text], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'table-layout.json';
            a.click();
            URL.revokeObjectURL(a.href);
          }}>导出 JSON</button>
          <button type="button" onClick={async () => {
            const text = exportJson();
            try { await navigator.clipboard.writeText(text); alert('已复制'); }
            catch { alert('请手动复制下方 JSON'); }
          }}>复制</button>
          <button type="button" onClick={() => {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
            alert(`已保存 ${Object.keys(overrides).length} 项覆盖`);
          }}>存本地</button>
          <button type="button" className="danger" onClick={() => {
            if (!confirm('清除所有拖拽覆盖，恢复现网默认位置？')) return;
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem('chekai-client-layout-lab-v1');
            localStorage.removeItem('chekai-client-layout-lab-v2');
            setOverrides({});
            setSelectedId(null);
            setJsonText('');
            // 清掉直接写在 DOM 上的样式
            phoneRef.current?.querySelectorAll<HTMLElement>('[data-lab-id]').forEach((el) => {
              el.classList.remove('overridden', 'selected');
              [
                'left', 'top', 'width', 'height', 'right', 'bottom', 'transform', 'position',
                'flex-shrink', 'min-height', 'max-height',
                '--lab-left', '--lab-top', '--lab-w', '--lab-h',
              ].forEach((p) => el.style.removeProperty(p));
            });
          }}>恢复默认</button>
          <label>
            操作栏
            <select value={barMode} onChange={(e) => setBarMode(e.target.value as typeof barMode)}>
              <option value="open">开叫</option>
              <option value="raised">已抬</option>
              <option value="split">配牌</option>
              <option value="lobby">开局</option>
              <option value="idle">等待</option>
            </select>
          </label>
        </div>
        <div className="lab-insp">
          <h2>{selectedId ? labelOf(selectedId) : '未选中'}{selectedId && overrides[selectedId] ? ' · 已改' : ''}</h2>
          {selectedBox && (
            <div className="lab-fields">
              {(['x', 'y', 'w', 'h'] as const).map((k) => (
                <label key={k}>
                  {k}
                  <input
                    type="number"
                    step="0.001"
                    value={selectedBox[k]}
                    disabled={selectedId === 'hud' && (k === 'x' || k === 'y' || k === 'w')}
                    onChange={(e) => {
                      if (!selectedId) return;
                      const next = { ...selectedBox, [k]: Number(e.target.value) };
                      if (selectedId === 'hud') {
                        next.x = 0; next.w = 1; next.y = 1 - next.h;
                      }
                      setBox(selectedId, next);
                    }}
                  />
                </label>
              ))}
            </div>
          )}
          <div className="lab-list">
            {itemIds.map((id) => (
              <button
                key={id}
                type="button"
                className={`${selectedId === id ? 'on' : ''}${overrides[id] ? ' dirty' : ''}`}
                onClick={() => setSelectedId(id)}
              >
                {labelOf(id)}{overrides[id] ? ' *' : ''}
              </button>
            ))}
          </div>
          <textarea className="lab-json" readOnly value={jsonText} placeholder="点「导出 JSON」后显示" />
        </div>
      </aside>

      <div className="layout-lab-preview">
        <div className="room-page tea-room action-open lab-phone" ref={phoneRef}>
          <header className="tea-top">
            <div className="tea-brand">
              <span className="tea-code">LAB</span>
              <span className="tea-meta">布局实验室 · 客户端实样</span>
              <span className="tea-phase">下注</span>
            </div>
            <div className="tea-top-tools">
              <RoomChromeIcons />
              <button className="tea-menu-btn" type="button" tabIndex={-1}>☰</button>
            </div>
          </header>

          <main className="game-area tea-stage" ref={stageRef}>
            <div
              className={`table-felt tea-felt ${labClass('felt')}`}
              data-lab-id="felt"
              ref={feltRef}
              style={styleFor('felt')}
            >
              <button
                type="button"
                className="lab-felt-handle"
                onPointerDown={(e) => onPointerDown(e, 'felt', 'move')}
              >
                拖桌面
              </button>
              <i className="lab-resize" onPointerDown={(e) => onPointerDown(e, 'felt', 'resize')} />

              <div
                className={`deck-pile ${labClass('deck')}`}
                data-lab-id="deck"
                style={styleFor('deck')}
                onPointerDown={(e) => onPointerDown(e, 'deck', 'move')}
              >
                <span className="lab-tag">牌堆</span>
                <div className="deck-stack" aria-hidden="true">
                  <i style={{ backgroundImage: `url(${cardBackUrl()})` }} />
                  <i style={{ backgroundImage: `url(${cardBackUrl()})` }} />
                  <i style={{ backgroundImage: `url(${cardBackUrl()})` }} />
                  <i style={{ backgroundImage: `url(${cardBackUrl()})` }} />
                </div>
                <div className="deck-count">28</div>
                <i className="lab-resize" onPointerDown={(e) => onPointerDown(e, 'deck', 'resize')} />
              </div>

              <div
                className={`pot tea-pot ${labClass('pot')}`}
                data-lab-id="pot"
                style={styleFor('pot')}
                onPointerDown={(e) => onPointerDown(e, 'pot', 'move')}
              >
                <span className="lab-tag">底池</span>
                <div className="chip-stack" aria-hidden="true"><i /><i /><i /><i /></div>
                <div className="pot-badge"><span className="pot-value">160</span></div>
                <div className="pot-sub">底池</div>
                <i className="lab-resize" onPointerDown={(e) => onPointerDown(e, 'pot', 'resize')} />
              </div>
            </div>

            {[0, 1, 2, 3, 4, 5, 6, 7].map((v) => (
              <div key={v}>
                <div
                  className={`seat-slot seat-vpos-${v} tea-seat${v === 4 ? ' lab-show-self' : ''} ${labClass(`seat-${v}`)}`}
                  data-lab-id={`seat-${v}`}
                  style={styleFor(`seat-${v}`)}
                  onPointerDown={(e) => onPointerDown(e, `seat-${v}`, 'move')}
                >
                  <span className="lab-tag">座位{v}</span>
                  <div className="timer-num show">&nbsp;</div>
                  <div className="seat-name name">{NAMES[v]}</div>
                  <div className="avatar-wrap-outer">
                    <Avatar nickname={NAMES[v]} size={38} />
                    {v === 0 && <span className="banker-badge badge">庄</span>}
                  </div>
                  <div className="seat-stack-row stack">
                    <span className="seat-score">{280 + v * 12}</span>
                  </div>
                  <i className="lab-resize" onPointerDown={(e) => onPointerDown(e, `seat-${v}`, 'resize')} />
                </div>

                <div
                  className={`public-cards public-cards-vpos-${v} ${labClass(`cards-${v}`)}`}
                  data-lab-id={`cards-${v}`}
                  style={styleFor(`cards-${v}`)}
                  onPointerDown={(e) => onPointerDown(e, `cards-${v}`, 'move')}
                >
                  <span className="lab-tag">公牌{v}</span>
                  <div className="card-slot"><CardView card={MY_HAND[v % 4]} size="small" /></div>
                  <div className="card-slot"><CardView faceDown size="small" /></div>
                  <i className="lab-resize" onPointerDown={(e) => onPointerDown(e, `cards-${v}`, 'resize')} />
                </div>

                <div
                  className={`tea-seat-bet tea-seat-bet-v${v} ${labClass(`bet-${v}`)}`}
                  data-lab-id={`bet-${v}`}
                  style={styleFor(`bet-${v}`, BET_POS[v])}
                  onPointerDown={(e) => onPointerDown(e, `bet-${v}`, 'move')}
                >
                  <span className="lab-tag">喊价{v}</span>
                  <i className="tea-seat-bet-chip" aria-hidden="true" />
                  <span className="tea-seat-bet-amt">{10 + v * 5}</span>
                  <i className="lab-resize" onPointerDown={(e) => onPointerDown(e, `bet-${v}`, 'resize')} />
                </div>
              </div>
            ))}
          </main>

          <footer
            className={`tea-hud ${labClass('hud')}`}
            ref={hudRef}
            data-lab-id="hud"
            style={overrides.hud ? {
              height: `${overrides.hud.h * 100}%`,
              flexShrink: 0,
              minHeight: 140,
              maxHeight: '55%',
              position: 'relative',
            } : { position: 'relative' }}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('[data-lab-id]:not([data-lab-id="hud"])')) return;
              // 空白处拖：只调高度
              onPointerDown(e, 'hud', 'move');
            }}
          >
            <span className="lab-tag">操作区高度</span>
            <i className="lab-resize" onPointerDown={(e) => onPointerDown(e, 'hud', 'resize')} />

            <div
              className={`self-timer show ${labClass('selfTimer')}`}
              data-lab-id="selfTimer"
              style={styleFor('selfTimer')}
              onPointerDown={(e) => onPointerDown(e, 'selfTimer', 'move')}
            >
              <span className="lab-tag">倒计时</span>
              <span className="label">42</span>
              <div className="track"><div className="fill" style={{ width: '65%' }} /></div>
              <button type="button" className="extend-turn-btn">+60s</button>
              <span className="tip">请操作</span>
              <i className="lab-resize" onPointerDown={(e) => onPointerDown(e, 'selfTimer', 'resize')} />
            </div>

            <div
              className={`self-row ${labClass('selfRow')}`}
              data-lab-id="selfRow"
              style={styleFor('selfRow')}
              onPointerDown={(e) => onPointerDown(e, 'selfRow', 'move')}
            >
              <span className="lab-tag">自己信息</span>
              <div className="self-id my-turn">
                <div className="av-wrap">
                  <Avatar nickname="张" size={28} timer={42} timerMax={60} />
                  <span className="banker-badge badge">庄</span>
                </div>
                <div>
                  <div className="nm">张</div>
                  <div className="sk">148</div>
                </div>
              </div>
              <div className="hint-mini private-guide">轮到你了</div>
              <i className="lab-resize" onPointerDown={(e) => onPointerDown(e, 'selfRow', 'resize')} />
            </div>

            <div
              className={`my-hand-area ${labClass('myHand')}`}
              data-lab-id="myHand"
              style={styleFor('myHand')}
              onPointerDown={(e) => onPointerDown(e, 'myHand', 'move')}
            >
              <span className="lab-tag">手牌</span>
              <div className="my-hand selectable">
                {MY_HAND.map((card, idx) => (
                  <div className="card-slot" key={card.id}>
                    <CardView card={card} selected={idx < 2} />
                  </div>
                ))}
              </div>
              <i className="lab-resize" onPointerDown={(e) => onPointerDown(e, 'myHand', 'resize')} />
            </div>

            <div
              className={`tea-action-root ${labClass('actionBar')}`}
              data-lab-id="actionBar"
              style={styleFor('actionBar')}
              onPointerDown={(e) => onPointerDown(e, 'actionBar', 'move')}
            >
              <span className="lab-tag">操作按钮</span>
              <ActionBar
                {...actionProps}
                raiseAmount={raiseAmount}
                onRaiseAmountChange={setRaiseAmount}
                onPlayerAction={() => {}}
                onConfirmSplit={() => {}}
                onClearSplitSelection={() => {}}
                onStartGame={() => {}}
                onReady={() => {}}
              />
              <i className="lab-resize" onPointerDown={(e) => onPointerDown(e, 'actionBar', 'resize')} />
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
