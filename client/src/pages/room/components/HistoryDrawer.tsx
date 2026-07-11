import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Card, RoundRecord } from '@/stores/gameStore';
import { CardView } from './CardView';

const EDGE_PX = 20;
const PANEL_MAX = 340;
const SNAP = 0.4;
const TAP_PX = 8;
const HANDLE_Y_KEY = 'chekai-history-handle-y';
const HANDLE_Y_DEFAULT = 0.42;
const HANDLE_Y_MIN = 0.12;
const HANDLE_Y_MAX = 0.88;

function loadHandleY(): number {
  try {
    const v = Number(localStorage.getItem(HANDLE_Y_KEY));
    if (Number.isFinite(v) && v >= HANDLE_Y_MIN && v <= HANDLE_Y_MAX) return v;
  } catch { /* ignore */ }
  return HANDLE_Y_DEFAULT;
}

function saveHandleY(y: number) {
  try {
    localStorage.setItem(HANDLE_Y_KEY, String(y));
  } catch { /* ignore */ }
}

function clampHandleY(y: number) {
  return Math.max(HANDLE_Y_MIN, Math.min(HANDLE_Y_MAX, y));
}

function HistoryCard({ card, dealLabel }: { card: Card; dealLabel?: string }) {
  return (
    <div className="history-card-wrap">
      <div className="history-card-slot">
        <CardView card={card} size="small" />
      </div>
      {dealLabel && <span className="history-deal-badge">{dealLabel}</span>}
    </div>
  );
}

interface HistoryDrawerProps {
  roundHistory: RoundRecord[];
}

/**
 * 右侧对局记录抽屉：
 * - 左右拖 / 点击把手：开合
 * - 上下拖把手：调整把手高度（位置会记住）
 */
export function HistoryDrawer({ roundHistory }: HistoryDrawerProps) {
  const [open, setOpen] = useState(false);
  const [viewingRound, setViewingRound] = useState(-1);
  const [dragTx, setDragTx] = useState<number | null>(null);
  const [handleY, setHandleY] = useState(loadHandleY);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  const handleYRef = useRef(handleY);
  openRef.current = open;
  handleYRef.current = handleY;

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originTx: number;
    originHandleY: number;
    axis: 'undecided' | 'x' | 'y';
    source: 'handle' | 'edge' | 'panel';
  } | null>(null);

  const panelWidth = useCallback(() => {
    const el = panelRef.current;
    if (el?.offsetWidth) return el.offsetWidth;
    return Math.min(PANEL_MAX, typeof window !== 'undefined' ? window.innerWidth * 0.82 : PANEL_MAX);
  }, []);

  const rootHeight = () => rootRef.current?.clientHeight || window.innerHeight || 1;

  const displayTx = dragTx;
  const drawerDragging = dragTx != null;

  useEffect(() => {
    if (open) setViewingRound(-1);
  }, [open]);

  const finishDrag = useCallback((clientX: number, clientY: number) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) {
      setDragTx(null);
      return;
    }

    const dx = clientX - d.startX;
    const dy = clientY - d.startY;

    // 把手上下拖：保存位置
    if (d.source === 'handle' && d.axis === 'y') {
      const next = clampHandleY(d.originHandleY + dy / rootHeight());
      setHandleY(next);
      saveHandleY(next);
      setDragTx(null);
      return;
    }

    if (d.axis === 'y') {
      setDragTx(null);
      return;
    }

    const w = panelWidth();

    // 把手轻点：切换开合
    if (
      d.source === 'handle'
      && (d.axis === 'undecided' || (Math.abs(dx) < TAP_PX && Math.abs(dy) < TAP_PX))
    ) {
      setOpen((v) => !v);
      setDragTx(null);
      return;
    }

    if (d.axis === 'x' || d.source === 'edge' || d.source === 'panel') {
      const tx = Math.max(0, Math.min(w, d.originTx + dx));
      setOpen(tx < w * (1 - SNAP));
    }
    setDragTx(null);
  }, [panelWidth]);

  const beginDrag = (
    e: ReactPointerEvent,
    source: 'handle' | 'edge' | 'panel',
  ) => {
    if (e.button != null && e.button !== 0) return;
    const w = panelWidth();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originTx: openRef.current ? 0 : w,
      originHandleY: handleYRef.current,
      axis: 'undecided',
      source,
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch { /* ignore */ }
    if (source !== 'handle') {
      setDragTx(openRef.current ? 0 : w);
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;

    if (d.axis === 'undecided') {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;

      if (d.source === 'handle') {
        d.axis = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
        if (d.axis === 'x') setDragTx(d.originTx);
      } else if (d.source === 'panel' && Math.abs(dy) > Math.abs(dx)) {
        dragRef.current = null;
        setDragTx(null);
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch { /* ignore */ }
        return;
      } else {
        d.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        if (d.axis === 'y') {
          dragRef.current = null;
          setDragTx(null);
          try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          } catch { /* ignore */ }
          return;
        }
        setDragTx(d.originTx);
      }
    }

    if (d.axis === 'y' && d.source === 'handle') {
      e.preventDefault();
      setHandleY(clampHandleY(d.originHandleY + dy / rootHeight()));
      return;
    }

    if (d.axis !== 'x') return;
    e.preventDefault();
    const w = panelWidth();
    setDragTx(Math.max(0, Math.min(w, d.originTx + dx)));
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    finishDrag(e.clientX, e.clientY);
  };

  const defaultIdx = roundHistory.length >= 2 ? roundHistory.length - 2 : 0;
  const idx = viewingRound === -1 ? defaultIdx : viewingRound;
  const rec = roundHistory[idx] || null;
  const w = panelWidth();
  const liveTx = displayTx != null ? displayTx : open ? 0 : w;
  const scrimOpacity = Math.max(0, 1 - liveTx / Math.max(1, w)) * 0.55;

  return (
    <div
      ref={rootRef}
      className={`history-drawer${open ? ' is-open' : ''}${drawerDragging ? ' is-dragging' : ''}`}
    >
      {!open && (
        <div
          className="history-drawer-edge"
          style={{ width: EDGE_PX }}
          onPointerDown={(e) => beginDrag(e, 'edge')}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-hidden
        />
      )}

      <button
        type="button"
        className="history-drawer-handle"
        style={{ top: `${handleY * 100}%` }}
        aria-label={open ? '收起对局记录' : '打开对局记录'}
        aria-expanded={open}
        title="上下拖动可调整位置"
        onPointerDown={(e) => beginDrag(e, 'handle')}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span className="history-drawer-handle-bar" />
        <span className="history-drawer-handle-label">记录</span>
        {roundHistory.length > 0 && (
          <span className="history-drawer-handle-count">{roundHistory.length}</span>
        )}
      </button>

      {(open || drawerDragging) && (
        <div
          className="history-drawer-scrim"
          style={{ opacity: scrimOpacity }}
          onClick={() => { setOpen(false); setDragTx(null); }}
          aria-hidden
        />
      )}

      <div
        ref={panelRef}
        className="history-drawer-panel"
        style={drawerDragging && displayTx != null ? {
          transform: `translate3d(${displayTx}px, 0, 0)`,
          transition: 'none',
        } : undefined}
        onPointerDown={(e) => {
          const rect = panelRef.current?.getBoundingClientRect();
          if (!rect || !openRef.current) return;
          if (e.clientX < rect.right - 36) return;
          beginDrag(e, 'panel');
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {roundHistory.length === 0 || !rec ? (
          <>
            <div className="history-header">
              <span className="history-title">对局记录</span>
              <button type="button" className="btn-sm history-close" onClick={() => setOpen(false)}>收起</button>
            </div>
            <div className="history-empty-body">暂无对局记录</div>
          </>
        ) : (
          <>
            <div className="history-header">
              <button
                type="button"
                className="btn-sm"
                disabled={idx <= 0}
                onClick={() => setViewingRound(idx - 1)}
              >
                ‹ 上一局
              </button>
              <span className="history-title">第 {rec.round} 局</span>
              <button
                type="button"
                className="btn-sm"
                disabled={idx >= roundHistory.length - 1}
                onClick={() => setViewingRound(idx + 1)}
              >
                下一局 ›
              </button>
            </div>
            <div className="history-body">
              {rec.players.map((p) => (
                <div
                  key={p.username}
                  className={`history-player${p.lastDelta > 0 ? ' winner' : p.lastDelta < 0 ? ' loser' : ''}`}
                >
                  <div className="history-player-name">
                    {p.nickname}
                    {p.username === rec.bankerUsername && <span className="history-banker-tag">庄</span>}
                    {p.folded && <span className="history-fold-tag">弃</span>}
                    {!p.folded && (p.rested || rec.endReason === 'rest_cross') && (
                      <span className="history-rest-tag">休</span>
                    )}
                  </div>
                  <div className="history-cards">
                    {(() => {
                      const cards = p.hand || [];
                      if (cards.length === 0) {
                        return <div className="history-fold-only">无牌</div>;
                      }
                      if (p.split?.head?.length || p.split?.tail?.length) {
                        const headCards = p.split.head?.length ? p.split.head : cards.slice(0, 2);
                        const tailCards = p.split.tail?.length ? p.split.tail : cards.slice(2);
                        return (
                          <>
                            <div className="history-card-group">
                              <span className="history-group-label">头</span>
                              {headCards.map((c, i) => <HistoryCard key={`h${i}`} card={c} />)}
                            </div>
                            <div className="history-card-divider" />
                            <div className="history-card-group">
                              <span className="history-group-label">尾</span>
                              {tailCards.map((c, i) => <HistoryCard key={`t${i}`} card={c} />)}
                            </div>
                          </>
                        );
                      }
                      return (
                        <div className="history-card-group">
                          {cards.map((c, i) => (
                            <HistoryCard key={`c${i}`} card={c} dealLabel={String(i + 1)} />
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="history-delta">
                    <span className="history-delta-label">净</span>
                    {p.lastDelta > 0 ? `+${p.lastDelta}` : p.lastDelta < 0 ? `${p.lastDelta}` : '0'}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="btn-sm history-close" onClick={() => setOpen(false)}>
              收起
            </button>
          </>
        )}
      </div>
    </div>
  );
}
