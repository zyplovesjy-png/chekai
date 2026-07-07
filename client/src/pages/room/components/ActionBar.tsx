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
  canHostStart: boolean;
  canReady: boolean;
  isReady: boolean;
  raiseAmount: string;
  onRaiseAmountChange: (value: string) => void;
  onMenu: () => void;
  onPlayerAction: (action: string, amount?: number) => void;
  onAutoSplit: () => void;
  onConfirmSplit: () => void;
  onClearSplitSelection: () => void;
  onStartGame: () => void;
  onReady: () => void;
}

const labels = {
  menuIcon: '\u2630',
  menu: '\u83dc\u5355',
  auto: '\u81ea\u52a8',
  confirm: '\u786e\u8ba4',
  reselect: '\u91cd\u9009',
  remaining: '\u5269\u4f59',
  see: '\u77a7',
  fold: '\u7529',
  raise: '\u8fd4',
  knock: '\u6572',
  showSanhua: '\u644a',
  rest: '\u4f11',
  call: '\u53eb',
  raiseScore: '\u8fd4\u5206',
  callScore: '\u53eb\u5206',
  startGame: '\u5f00\u59cb\u5bf9\u5c40',
  ready: '\u51c6\u5907',
  cancelReady: '\u53d6\u6d88\u51c6\u5907',
  wait: '\u7b49\u5f85',
  chat: '\u804a\u5929',
  chatIcon: '\u2709',
};

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
  canHostStart,
  canReady,
  isReady,
  raiseAmount,
  onRaiseAmountChange,
  onMenu,
  onPlayerAction,
  onAutoSplit,
  onConfirmSplit,
  onClearSplitSelection,
  onStartGame,
  onReady,
}: ActionBarProps) {
  const sliderMin = betStarted ? Math.max(1, currentBet) : Math.max(1, minBet);
  const sliderMax = Math.max(sliderMin, (playerChips || 0) + (playerRoundCommitted || 0), maxBet && maxBet < Number.MAX_SAFE_INTEGER ? maxBet : 0);
  const parsedAmount = Number(raiseAmount || sliderMin);
  const sliderValue = Math.min(sliderMax, Math.max(sliderMin, Number.isFinite(parsedAmount) ? parsedAmount : sliderMin));
  const showTurnPanel = phase === 'selecting' || (isMyTurn && isBetting);

  const setAmount = (value: number) => {
    const clamped = Math.min(sliderMax, Math.max(sliderMin, Math.round(value)));
    onRaiseAmountChange(String(clamped));
  };

  const wagerControl = (label: string) => (
    <div className="wager-panel turn-wager-panel">
      <div className="wager-head">
        <span>{label}</span>
        <strong>{sliderMax}</strong>
      </div>
      <input
        className="wager-slider"
        type="range"
        min={sliderMin}
        max={sliderMax}
        step={1}
        value={sliderValue}
        onChange={(event) => setAmount(Number(event.target.value))}
        aria-label={label}
      />
      <div className="wager-range">
        <span>{sliderValue}</span>
        <span>{labels.remaining} {playerChips || 0}</span>
      </div>
    </div>
  );

  const renderTurnPanel = () => {
    if (phase === 'selecting') {
      return (
        <div className="turn-action-panel split-turn-panel">
          <div className="split-action-layout">
            <button className="btn action-orb" onClick={onAutoSplit}>{labels.auto}</button>
            <button className="btn btn-primary action-orb" disabled={selectedCount !== 2} onClick={onConfirmSplit}>{labels.confirm}</button>
            <button className="btn action-orb" onClick={onClearSplitSelection}>{labels.reselect}</button>
          </div>
        </div>
      );
    }

    if (!isMyTurn || !isBetting) return null;

    return (
      <div className="turn-action-panel bet-turn-panel">
        {betStarted ? (
          <>
            <div className="turn-action-group turn-action-left">
              <button className="btn action-orb" onClick={() => onPlayerAction('knock')}>{labels.knock}</button>
              <button className="btn action-orb" onClick={() => onPlayerAction('fold')}>{labels.fold}</button>
              {canShowSanhua && <button className="btn action-orb" onClick={() => onPlayerAction('show_sanhua')}>{labels.showSanhua}</button>}
            </div>
            {wagerControl(labels.raiseScore)}
            <div className="turn-action-group turn-action-right">
              <button className="btn action-orb" onClick={() => onPlayerAction('raise', sliderValue)}>{labels.raise}</button>
              <button className="btn action-orb" onClick={() => onPlayerAction('see')}>{labels.see}</button>
            </div>
          </>
        ) : (
          <>
            <div className="turn-action-group turn-action-left single-action">
              <button className="btn action-orb" onClick={() => onPlayerAction('rest')}>{labels.rest}</button>
              <button className="btn action-orb" onClick={() => onPlayerAction('fold')}>{labels.fold}</button>
            </div>
            {wagerControl(labels.callScore)}
            <div className="turn-action-group turn-action-right single-action">
              <button className="btn action-orb" onClick={() => onPlayerAction('knock')}>{labels.knock}</button>
              <button className="btn action-orb" onClick={() => onPlayerAction('call', sliderValue)}>{labels.call}</button>
              {canShowSanhua && <button className="btn action-orb" onClick={() => onPlayerAction('show_sanhua')}>{labels.showSanhua}</button>}
            </div>
          </>
        )}
      </div>
    );
  };

  const renderFooterCenter = () => {
    if (showTurnPanel) return <div className="action-idle" />;
    if (canHostStart) return <button className="btn btn-primary start-game-btn" onClick={onStartGame}>{labels.startGame}</button>;
    if (canReady) return <button className="btn btn-primary start-game-btn" onClick={onReady}>{isReady ? labels.cancelReady : labels.ready}</button>;
    return <div className="action-idle">{labels.wait}</div>;
  };

  return (
    <>
      {renderTurnPanel()}
      <footer className="bottom-bar">
        <button className="bottom-btn menu-btn" onClick={onMenu} aria-label={labels.menu}>
          <span className="icon">{labels.menuIcon}</span>
        </button>

        <div className="action-buttons">
          {renderFooterCenter()}
        </div>

        <button className="bottom-btn chat-btn" type="button" aria-label={labels.chat}>
          <span className="icon">{labels.chatIcon}</span>
        </button>
      </footer>
    </>
  );
}
