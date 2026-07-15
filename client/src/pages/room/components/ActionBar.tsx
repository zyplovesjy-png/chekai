import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

interface ActionBarProps {
  phase: string;
  isMyTurn: boolean;
  isBetting: boolean;
  betStarted: boolean;
  currentBet: number;
  minBet: number;
  maxBet: number;
  playerChips: number;
  playerRoundCommitted: number;
  canShowSanhua: boolean;
  selectedCount: number;
  splitConfirmed: boolean;
  canHostStart: boolean;
  canReady: boolean;
  isReady: boolean;
  raiseAmount: string;
  onRaiseAmountChange: (value: string) => void;
  onPlayerAction: (action: string, amount?: number) => void;
  onConfirmSplit: () => void;
  onClearSplitSelection: () => void;
  onStartGame: () => void;
  onReady: () => void;
  onHintChange?: (hint: string) => void;
  idleLabel?: string;
}

type BarMode = 'open' | 'raised' | 'short' | 'split' | 'compare' | 'idle' | 'lobby';

const labels = {
  confirm: '确认',
  reselect: '重选',
  cancel: '取消',
  see: '瞧',
  fold: '丢',
  raise: '返',
  knock: '敲',
  showSanhua: '摊',
  rest: '休',
  call: '叫',
  startGame: '开始对局',
  ready: '准备',
  cancelReady: '取消准备',
  wait: '等待中…',
  waitNext: '等待下一局',
  dragHint: '上下拖动改金额',
};

function DragCta({
  verb,
  value,
  min,
  max,
  onChange,
  onSubmit,
  onDragState,
}: {
  verb: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  onSubmit: (n: number) => void;
  onDragState?: (state: { dragging: boolean; moved: boolean; value: number }) => void;
}) {
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const startYRef = useRef(0);
  const startValRef = useRef(0);
  const valueRef = useRef(value);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    draggingRef.current = true;
    movedRef.current = false;
    startYRef.current = e.clientY;
    startValRef.current = valueRef.current;
    setDragging(true);
    onDragState?.({ dragging: true, moved: false, value: valueRef.current });
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!draggingRef.current) return;
    const dy = startYRef.current - e.clientY;
    if (Math.abs(dy) > 4) movedRef.current = true;
    const next = clamp(startValRef.current + Math.round(dy / 2));
    valueRef.current = next;
    onChange(next);
  };

  const onPointerUp = () => {
    if (!draggingRef.current) return;
    const didMove = movedRef.current;
    const finalVal = valueRef.current;
    draggingRef.current = false;
    setDragging(false);
    onDragState?.({ dragging: false, moved: didMove, value: finalVal });
    if (!didMove) onSubmit(finalVal);
  };

  return (
    <button
      className={`tea-cta${dragging ? ' dragging' : ''}`}
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ touchAction: 'none' }}
    >
      <span className="cta-verb">{verb}</span>
      <em className="cta-value">{value}</em>
      <span className="drag-hint">{labels.dragHint}</span>
    </button>
  );
}

export function ActionBar({
  phase,
  isMyTurn,
  isBetting,
  betStarted,
  currentBet,
  minBet,
  maxBet,
  playerChips,
  playerRoundCommitted,
  canShowSanhua,
  selectedCount,
  splitConfirmed,
  canHostStart,
  canReady,
  isReady,
  raiseAmount,
  onRaiseAmountChange,
  onPlayerAction,
  onConfirmSplit,
  onClearSplitSelection,
  onStartGame,
  onReady,
  onHintChange,
  idleLabel,
}: ActionBarProps) {
  const totalStack = (playerChips || 0) + (playerRoundCommitted || 0);
  const raiseMin = betStarted ? Math.max(1, currentBet * 2) : Math.max(1, minBet);
  const sliderMin = raiseMin;
  const sliderMax = Math.max(
    sliderMin,
    totalStack,
    maxBet && maxBet < Number.MAX_SAFE_INTEGER ? maxBet : 0,
  );
  const effectiveMax = Math.max(sliderMin, totalStack);
  const parsedAmount = Number(raiseAmount || sliderMin);
  // 超出上限时回到最低额，切勿夹成 totalStack——否则上一局敲完留下的大额
  // 会在下一局开叫时被「纠正」成全额簸簸，看起来像最低叫分变成了全部筹码
  const displayValue = !Number.isFinite(parsedAmount)
    ? sliderMin
    : parsedAmount < sliderMin
      ? sliderMin
      : parsedAmount > effectiveMax
        ? sliderMin
        : parsedAmount;

  const cannotAffordSee = betStarted
    ? (currentBet > 0 && totalStack < currentBet)
    : (totalStack < Math.max(1, minBet) && totalStack > 0);
  const canAffordRaise = totalStack >= raiseMin;
  const broke = totalStack <= 0;
  const shortStack = isMyTurn && isBetting && (cannotAffordSee || broke);
  const noBetYet = !betStarted && currentBet <= 0;
  const canFoldBeforeBet = phase === 'betting1';

  const [localSplitDone, setLocalSplitDone] = useState(false);
  const splitDone = splitConfirmed || localSplitDone;

  useEffect(() => {
    if (phase !== 'selecting') setLocalSplitDone(false);
  }, [phase]);

  useEffect(() => {
    if (splitConfirmed) setLocalSplitDone(true);
  }, [splitConfirmed]);

  // 每次进入可操作下注态，重置为当前最低可下注额（不记忆上次拖动值）
  useEffect(() => {
    if (!(isMyTurn && isBetting) || shortStack) return;
    onRaiseAmountChange(String(sliderMin));
  }, [isMyTurn, isBetting, betStarted, currentBet, minBet, phase, sliderMin]); // eslint-disable-line react-hooks/exhaustive-deps

  // 仅在金额越界时拉回最低额（与上面重置一致，避免夹成全额簸簸）
  useEffect(() => {
    if (!(isMyTurn && isBetting) || shortStack) return;
    const n = Number(raiseAmount);
    if (!Number.isFinite(n) || n < sliderMin || n > effectiveMax) {
      onRaiseAmountChange(String(sliderMin));
    }
  }, [sliderMin, effectiveMax, raiseAmount, isMyTurn, isBetting, shortStack]); // eslint-disable-line react-hooks/exhaustive-deps

  const setAmount = (value: number) => {
    onRaiseAmountChange(String(Math.min(effectiveMax, Math.max(sliderMin, Math.round(value)))));
  };

  const resolveMode = (): BarMode => {
    if (phase === 'dealing') return 'idle';
    // 配牌选择栏：仅在配牌阶段、且尚未确认时显示
    if (phase === 'selecting') {
      return splitDone ? 'idle' : 'split';
    }
    if (phase === 'comparing') return 'compare';
    if (phase === 'done') return 'compare';
    if (isMyTurn && isBetting) {
      if (shortStack) return 'short';
      return betStarted ? 'raised' : 'open';
    }
    if (canHostStart || canReady) return 'lobby';
    return 'idle';
  };

  const mode = resolveMode();

  useEffect(() => {
    if (!onHintChange) return;
    // 叫/返提示已写在按钮上，消息区不再重复
    if (mode === 'short') {
      if (noBetYet) {
        onHintChange(canFoldBeforeBet ? '本轮无人下注，可休、敲或丢' : '本轮无人下注，只能休或敲');
      } else {
        onHintChange(broke ? '筹码不足，只能丢' : '筹码不足，只能敲或丢');
      }
    } else if (mode === 'split') {
      onHintChange(
        canShowSanhua
          ? (selectedCount === 2
            ? '可摊三花，或点确认配牌（配牌即放弃摊）'
            : '敲后成三花可摊；或点选两张牌配对')
          : selectedCount === 2
            ? '已选两张，点确认（系统自动分头尾）'
            : '点选两张牌配对',
      );
    } else if (phase === 'selecting' && splitDone) {
      onHintChange('已确认配牌，等待其他玩家');
    } else if (mode === 'compare' && phase === 'comparing') {
      onHintChange('比牌中…');
    } else {
      onHintChange('');
    }
  }, [mode, selectedCount, splitDone, broke, noBetYet, canFoldBeforeBet, onHintChange, phase, canShowSanhua]);

  const sanhuaBtn = canShowSanhua && (mode === 'open' || mode === 'raised' || mode === 'short' || mode === 'split') ? (
    <button className="tea-pill" type="button" onClick={() => onPlayerAction('show_sanhua')}>
      {labels.showSanhua}
    </button>
  ) : null;

  const renderBar = () => {
    switch (mode) {
      case 'open':
        return (
          <div className="tea-bar open show">
            <div className="side">
              <button className="tea-pill" type="button" onClick={() => onPlayerAction('rest')}>{labels.rest}</button>
              {canFoldBeforeBet && (
                <button className="tea-pill danger" type="button" onClick={() => onPlayerAction('fold')}>{labels.fold}</button>
              )}
            </div>
            <DragCta
              verb={labels.call}
              value={displayValue}
              min={sliderMin}
              max={effectiveMax}
              onChange={setAmount}
              onSubmit={(n) => onPlayerAction('call', n)}
            />
            <button className="tea-pill" type="button" onClick={() => onPlayerAction('knock')}>{labels.knock}</button>
            {sanhuaBtn}
          </div>
        );

      case 'raised':
        return (
          <div className="tea-bar raised show">
            <div className="side">
              <button className="tea-pill" type="button" onClick={() => onPlayerAction('knock')}>{labels.knock}</button>
              <button className="tea-pill danger" type="button" onClick={() => onPlayerAction('fold')}>{labels.fold}</button>
            </div>
            {canAffordRaise ? (
              <DragCta
                verb={labels.raise}
                value={displayValue}
                min={sliderMin}
                max={effectiveMax}
                onChange={setAmount}
                onSubmit={(n) => onPlayerAction('raise', n)}
              />
            ) : null}
            <button className="tea-pill" type="button" onClick={() => onPlayerAction('see')}>{labels.see}</button>
            {sanhuaBtn}
          </div>
        );

      case 'short':
        if (noBetYet) {
          return (
            <div className="tea-bar short show">
              <button className="tea-pill" type="button" onClick={() => onPlayerAction('rest')}>{labels.rest}</button>
              {canFoldBeforeBet && (
                <button className="tea-pill danger" type="button" onClick={() => onPlayerAction('fold')}>{labels.fold}</button>
              )}
              {!broke && (
                <button className="tea-pill" type="button" onClick={() => onPlayerAction('knock')}>{labels.knock}</button>
              )}
              {sanhuaBtn}
            </div>
          );
        }
        return (
          <div className="tea-bar short show">
            {!broke && (
              <button className="tea-pill" type="button" onClick={() => onPlayerAction('knock')}>{labels.knock}</button>
            )}
            <button className="tea-pill danger" type="button" onClick={() => onPlayerAction('fold')}>{labels.fold}</button>
            {sanhuaBtn}
          </div>
        );

      case 'split':
        return (
          <div className="tea-bar split show">
            <button
              className="tea-pill"
              type="button"
              onClick={() => {
                onClearSplitSelection();
              }}
            >
              {labels.reselect}
            </button>
            <button
              className="tea-cta"
              type="button"
              disabled={selectedCount !== 2}
              onClick={() => {
                if (selectedCount !== 2) return;
                setLocalSplitDone(true);
                onConfirmSplit();
              }}
            >
              {labels.confirm}
            </button>
            {sanhuaBtn}
          </div>
        );

      case 'compare':
        return (
          <div className="tea-bar compare show">
            <button className="tea-cta" type="button" disabled>
              {phase === 'comparing' ? '比牌中…' : labels.waitNext}
            </button>
          </div>
        );

      case 'lobby':
        if (canHostStart) {
          return (
            <div className="tea-bar lobby show">
              <button className="tea-cta" type="button" onClick={onStartGame}>{labels.startGame}</button>
            </div>
          );
        }
        return (
          <div className="tea-bar lobby show">
            <button className="tea-cta" type="button" onClick={onReady}>
              {isReady ? labels.cancelReady : labels.ready}
            </button>
          </div>
        );

      default:
        return (
          <div className="tea-bar idle show">
            <span className="tea-idle">{idleLabel || labels.wait}</span>
          </div>
        );
    }
  };

  return <div className="tea-action-root">{renderBar()}</div>;
}
