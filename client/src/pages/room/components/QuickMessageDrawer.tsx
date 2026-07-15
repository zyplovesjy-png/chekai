import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { QuickMessage } from '@/types/quickMessages';

const MAX_MESSAGE_CHARS = 40;
const EDGE_PX = 18;
const PANEL_MAX = 340;
const OPEN_SNAP = 0.6;

function clampMessage(value: string) {
  return Array.from(value).slice(0, MAX_MESSAGE_CHARS).join('');
}

interface QuickMessageDrawerProps {
  open: boolean;
  messages: QuickMessage[];
  onOpenChange: (open: boolean) => void;
  onSend: (content: string) => boolean;
}

export function QuickMessageDrawer({
  open,
  messages,
  onOpenChange,
  onSend,
}: QuickMessageDrawerProps) {
  const [content, setContent] = useState('');
  const [dragTx, setDragTx] = useState<number | null>(null);
  const composingRef = useRef(false);
  const panelRef = useRef<HTMLElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originTx: number;
    axis: 'undecided' | 'x' | 'y';
  } | null>(null);

  const panelWidth = useCallback(() => (
    panelRef.current?.offsetWidth
    || Math.min(PANEL_MAX, typeof window !== 'undefined' ? window.innerWidth * 0.86 : PANEL_MAX)
  ), []);

  useEffect(() => {
    if (!open) setContent('');
  }, [open]);

  const send = (value: string) => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) return;
    if (onSend(normalized)) {
      setContent('');
      onOpenChange(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (composingRef.current) return;
    send(content);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && event.nativeEvent.isComposing) {
      event.preventDefault();
    }
  };

  const beginDrag = (event: ReactPointerEvent) => {
    if (event.button != null && event.button !== 0) return;
    const width = panelWidth();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originTx: openRef.current ? 0 : width,
      axis: 'undecided',
    };
    setDragTx(openRef.current ? 0 : width);
    try { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); } catch { /* ignore */ }
  };

  const handlePointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.axis === 'undecided') {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
      if (drag.axis === 'y') {
        dragRef.current = null;
        setDragTx(null);
        try { (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId); } catch { /* ignore */ }
        return;
      }
    }
    if (drag.axis !== 'x') return;
    event.preventDefault();
    const width = panelWidth();
    setDragTx(Math.max(0, Math.min(width, drag.originTx + dx)));
  };

  const finishDrag = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.axis === 'x') {
      const width = panelWidth();
      const tx = Math.max(0, Math.min(width, drag.originTx + event.clientX - drag.startX));
      onOpenChange(tx < width * OPEN_SNAP);
    }
    setDragTx(null);
  };

  const dragging = dragTx != null;
  const width = panelWidth();
  const liveTx = dragTx ?? (open ? 0 : width);
  const scrimOpacity = Math.max(0, 1 - liveTx / Math.max(1, width)) * 0.48;

  return (
    <div
      className={`quick-message-drawer${open ? ' is-open' : ''}${dragging ? ' is-dragging' : ''}`}
      aria-hidden={!open && !dragging}
    >
      {!open && (
        <div
          className="quick-message-edge"
          style={{ width: EDGE_PX }}
          onPointerDown={beginDrag}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          aria-hidden
        />
      )}
      {(open || dragging) && (
        <button
          type="button"
          className="quick-message-scrim"
          style={{ opacity: scrimOpacity }}
          aria-label="关闭快捷消息"
          onClick={() => { onOpenChange(false); setDragTx(null); }}
        />
      )}
      <aside
        ref={panelRef}
        className="quick-message-panel"
        aria-label="快捷消息"
        inert={!open && !dragging}
        style={dragging ? { transform: `translate3d(${liveTx}px, 0, 0)`, transition: 'none' } : undefined}
        onPointerDown={(event) => {
          const rect = panelRef.current?.getBoundingClientRect();
          if (!rect || !openRef.current || event.clientX > rect.left + 36) return;
          beginDrag(event);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <header className="quick-message-header">
          <div>
            <strong>快捷消息</strong>
            <span>选择一条或手动输入</span>
          </div>
          <button type="button" className="quick-message-close" onClick={() => onOpenChange(false)}>
            收起
          </button>
        </header>

        <div className="quick-message-list">
          {messages.length === 0 ? (
            <div className="quick-message-empty">管理员暂未设置快捷消息</div>
          ) : messages.map((message) => (
            <button
              key={message.id}
              type="button"
              className="quick-message-preset"
              onClick={() => send(message.content)}
            >
              {message.content}
            </button>
          ))}
        </div>

        <form className="quick-message-compose" onSubmit={submit}>
          <div className="quick-message-input-wrap">
            <input
              value={content}
              onChange={(event) => setContent(clampMessage(event.target.value))}
              onCompositionStart={() => { composingRef.current = true; }}
              onCompositionEnd={() => { composingRef.current = false; }}
              onKeyDown={handleInputKeyDown}
              placeholder="输入消息…"
              aria-label="输入消息"
              autoComplete="off"
            />
            <span>{Array.from(content).length}/{MAX_MESSAGE_CHARS}</span>
          </div>
          <button type="submit" disabled={!content.trim()}>发送</button>
        </form>
      </aside>
    </div>
  );
}
