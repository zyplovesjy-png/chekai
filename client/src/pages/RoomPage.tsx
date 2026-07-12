import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useRoomStore, EXTEND_OPTIONS, formatCountdown, formatDurationLabel } from '@/stores/roomStore';
import { isRealCompare } from '@/stores/gameStore';
import { useApi } from '@/hooks/useApi';
import { MyHand } from './room/components/MyHand';
import { PlayerSeat, Avatar, getTimerUrgency } from './room/components/PlayerSeat';
import { PublicCards } from './room/components/PublicCards';
import { SeatBetMarkers } from './room/components/SeatBetMarkers';
import { useRoomGameController } from './room/useRoomGameController';
import { HistoryDrawer } from './room/components/HistoryDrawer';
import { ActionBar } from './room/components/ActionBar';
import { AnimatedLayer } from './room/components/AnimatedLayer';
import { PixiTableLayer } from './room/pixi/PixiTableLayer';
import { TURN_TIME_SECONDS } from './room/constants';
import { cardBackUrl } from './room/cardAssets';
import { isSfxEnabled, toggleSfxEnabled } from './room/sounds';
import { RoomChromeIcons } from '@/components/AppChromeIcons';
import { pauseGameAssetPreload } from '@/utils/gameAssetPreload';

/** 簸簸 ≤ 房间最少带入分时，在数字旁提示「点击加簸」 */
const DEFAULT_MIN_BUYIN = 100;

/* ========== 主页面 ========== */
export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const api = useApi();
  const user = useAuthStore((s) => s.user);
  const myUsername = user?.username || '';
  const { room, setRoom } = useRoomStore();
  const pixiEnabled = import.meta.env.VITE_PIXI_TABLE === '1';
  const [sfxOn, setSfxOn] = useState(() => isSfxEnabled());

  useEffect(() => {
    pauseGameAssetPreload();
  }, []);

  useEffect(() => {
    const sync = () => setSfxOn(isSfxEnabled());
    window.addEventListener('chekai-sfx-changed', sync);
    return () => window.removeEventListener('chekai-sfx-changed', sync);
  }, []);

  const {
    game,
    showBuyIn,
    setShowBuyIn,
    showSeatChange,
    setShowSeatChange,
    pendingSeatIdx,
    buyInAmount,
    setBuyInAmount,
    buyInMode,
    carryChips,
    showMenu,
    setShowMenu,
    raiseAmount,
    setRaiseAmount,
    turnTimer,
    turnTimerMax,
    dealAnim,
    chipAnim,
    isDealing,
    visualSeats,
    currentActor,
    getAvatar,
    handleSit,
    handleSitConfirm,
    handleSeatChangeConfirm,
    emptySeatAction,
    handleStandUp,
    handleReady,
    handleStartGame,
    handleLeaveRoom,
    handleAction,
    handleCardClick,
    handleConfirmSplit,
    handleExtendTurn,
    handleExtendTime,
    handlePauseGame,
    handleResumeGame,
    handleHostEndAfterHand,
    allReady,
    spectators,
    isMyTurn,
    isBetting,
    betStarted,
    handleAddBuyIn,
    handleBuyInDecision,
    buyInDecision,
    addBuyInAmount,
    setAddBuyInAmount,
  } = useRoomGameController({ code, room, myUsername, navigate, api, setRoom });

  const [showAddBuyIn, setShowAddBuyIn] = useState(false);
  const [showSpectators, setShowSpectators] = useState(false);
  const [showExtendTime, setShowExtendTime] = useState(false);
  const [actionHint, setActionHint] = useState('');
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    if (!room?.gameStarted || !room?.endsAt || room?.paused) return;
    const id = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [room?.gameStarted, room?.endsAt, room?.paused]);

  const sessionRemainLabel = room?.paused
    ? '已暂停'
    : room?.gameStarted && room?.endsAt
      ? formatCountdown(room.endsAt, nowTs)
      : formatDurationLabel(room?.durationMinutes);

  const myPlayer = game.players.find((player) => player.username === myUsername);
  const mySeat = room?.seats.find((seat) => seat?.username === myUsername) ?? null;
  const isHostUser = !!room && myUsername === room.host;
  const canReady = !!room && !room.gameStarted && !!mySeat && !isHostUser;
  const realCompare = game.phase === 'comparing' || isRealCompare(game.compareResult);
  const endReason = game.compareResult?.reason;

  const phaseLabel = (() => {
    if (!game.gameStarted && !room?.gameStarted) return '等待开始';
    switch (game.phase) {
      case 'dealing':
        return '发牌中';
      case 'betting1':
        return game.currentBet > 0 ? `第1轮 · 喊价${game.currentBet}` : '第1轮';
      case 'betting2':
        return game.currentBet > 0 ? `第2轮 · 喊价${game.currentBet}` : '第2轮';
      case 'betting3':
        return game.currentBet > 0 ? `第3轮 · 喊价${game.currentBet}` : '第3轮';
      case 'selecting':
        return '配牌中';
      case 'comparing':
        return '比牌中';
      case 'done':
        if (endReason === 'all_folded') return '本局结束';
        if (endReason === 'rest_cross') return '全休结束';
        return realCompare ? '比牌结束' : '本局结束';
      case 'gameover':
        return '游戏结束';
      default:
        return game.gameStarted || room?.gameStarted ? '进行中' : '等待开始';
    }
  })();

  const tableToastText = (() => {
    if (isDealing) return '发牌中…';
    if (buyInDecision?.waitingText) return buyInDecision.waitingText;
    if (game.tableToast?.text) return game.tableToast.text;
    return '';
  })();

  const privateGuide = actionHint
    || (!game.gameStarted
      ? (mySeat ? '等待房主开始游戏' : '请选择座位加入')
      : '');

  const myTotalPot = (myPlayer?.pot ?? mySeat?.buyIn ?? 0) + (myPlayer?.committed || 0);
  const myAvailableChips = myPlayer?.pot ?? mySeat?.buyIn ?? 0;
  const lowChipThreshold = room?.minBuyIn || DEFAULT_MIN_BUYIN;
  const hasPendingBuyIn = (myPlayer?.pendingBuyIn || 0) > 0;
  // 整场进行中、已入座、簸簸≤最少带入、且尚未申请加簸 → 显示气泡
  const showAddBuyInHint = !!room?.gameStarted
    && !!mySeat
    && !buyInDecision
    && myAvailableChips <= lowChipThreshold
    && !hasPendingBuyIn;

  const potSubText = game.phase === 'comparing'
    ? '比牌中'
    : game.phase === 'done'
      ? (endReason === 'rest_cross' ? '全休' : endReason === 'all_folded' ? '独赢' : realCompare ? '比牌结束' : '本局结束')
      : game.gameStarted && game.currentBet > 0
        ? `喊价 ${game.currentBet}`
        : (() => {
            const lv = Math.floor(Number(game.openingMango?.level) || 0);
            if (lv === 1) return '一芒';
            if (lv === 2) return '二芒';
            if (lv === 3) return '三芒';
            return '';
          })();

  // 渲染每个座位区域（头像+明牌；自己在 HUD）
  const renderSeatArea = (physIdx: number, visualIdx: number) => {
    const seat = room?.seats?.[physIdx] ?? null;
    const player = seat ? game.players.find((p) => p.username === seat.username) : undefined;
    const isMe = seat?.username === myUsername;
    const isMyTurnLocal = currentActor === seat?.username;
    const isBanker = seat ? seat.username === game.bankerUsername : false;
    const isHost = seat ? seat.username === room?.host : false;
    const isFolded = !!player?.folded;
    const isDisconnected = !!seat && !!room?.members.find((member) => member.username === seat.username)?.disconnected;
    const isKnocked = !!player && !isFolded && game.knockedThisRound.includes(seat?.username || '');
    const brokeEntry = seat && buyInDecision
      ? buyInDecision.players.find((p) => p.username === seat.username)
      : undefined;
    const brokeStatus = brokeEntry
      ? (brokeEntry.choice === 'continue' ? 'rebought' : brokeEntry.choice === 'settle' ? 'exited' : 'pending')
      : null;

    return (
      <PlayerSeat
        key={visualIdx}
        seat={seat}
        physIdx={physIdx}
        seatIdx={visualIdx}
        player={player}
        isMe={isMe}
        isMyTurn={isMyTurnLocal}
        gameStarted={!!room?.gameStarted}
        avatarPath={getAvatar(seat?.username)}
        timer={(!isDealing && isMyTurnLocal) ? turnTimer : undefined}
        timerMax={turnTimerMax}
        onSit={handleSit}
        onReady={handleReady}
        isBanker={isBanker}
        isHost={isHost}
        isFolded={isFolded}
        isDisconnected={isDisconnected}
        isKnocked={isKnocked}
        brokeStatus={brokeStatus}
        emptySeatAction={emptySeatAction}
      />
    );
  };

  const myBrokePending = !!buyInDecision
    && buyInDecision.players.some((p) => p.username === myUsername && !p.choice);

  const openMenu = () => setShowMenu(true);
  const closeMenu = () => setShowMenu(false);

  const showSelfTimer = !isDealing && ((isMyTurn && isBetting) || (isMyTurn && game.phase === 'selecting'));
  const selfUrgency = showSelfTimer ? getTimerUrgency(turnTimer, turnTimerMax) : '';
  const selfTimerRatio = Math.max(0, Math.min(100, ((turnTimer ?? 0) / Math.max(turnTimerMax, 1)) * 100));
  const showActionOverlay = !isDealing && !room?.paused && (
    (game.phase === 'selecting' && !game.mySplit)
    || (isMyTurn && isBetting)
  );

  return (
    <div className={`room-page tea-room${showActionOverlay ? ' action-open' : ''}`}>
      <header className="tea-top">
        <div className="tea-brand">
          <span className="tea-code">{room?.code || code || '--'}</span>
          <span className="tea-meta">
            {game.gameStarted || room?.gameStarted
              ? `第${game.gameStarted ? game.round : (room?.gameRound || 0)}局 · ${sessionRemainLabel}`
              : sessionRemainLabel}
          </span>
          <span className="tea-phase" aria-live="polite">
            {room?.paused ? '已暂停' : room?.endAfterHand ? `${phaseLabel} · 本局后结算` : phaseLabel}
          </span>
        </div>
        <div className="tea-top-tools">
          <RoomChromeIcons />
          <button
            className={`tea-menu-btn tea-sfx-btn${sfxOn ? '' : ' is-muted'}`}
            type="button"
            aria-label={sfxOn ? '关闭音效' : '开启音效'}
            aria-pressed={sfxOn}
            onClick={() => {
              const next = toggleSfxEnabled();
              setSfxOn(next);
            }}
          >
            {sfxOn ? (
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1-3.29-2.5-4.03v8.05c1.5-.74 2.5-2.26 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path fill="currentColor" d="M16.5 12c0-1.77-1-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              </svg>
            )}
          </button>
          <button className="tea-menu-btn" type="button" aria-label="菜单" onClick={openMenu}>☰</button>
        </div>
      </header>

      {/* 牌桌舞台 */}
      <main className="game-area tea-stage">
        <PixiTableLayer enabled={pixiEnabled} dealAnim={dealAnim} chipAnim={chipAnim} />

        <div className={`table-felt tea-felt${pixiEnabled ? ' pixi-backed' : ''}`}>
          {game.gameStarted && (
            <div className="deck-pile" aria-label={`剩余 ${game.remainingCards} 张`}>
              <div className="deck-stack" aria-hidden="true">
                <i style={{ backgroundImage: `url(${cardBackUrl()})` }} />
                <i style={{ backgroundImage: `url(${cardBackUrl()})` }} />
                <i style={{ backgroundImage: `url(${cardBackUrl()})` }} />
                <i style={{ backgroundImage: `url(${cardBackUrl()})` }} />
              </div>
              <div className="deck-count">{game.remainingCards}</div>
            </div>
          )}
          <div className="pot tea-pot">
            <div className="chip-stack" aria-hidden="true"><i /><i /><i /><i /></div>
            <div className="pot-badge">
              <span className="pot-value">{game.potPi}</span>
            </div>
            {potSubText && <div className="pot-sub">{potSubText}</div>}
          </div>
          {tableToastText && (
            <div className="table-global-message tea-toast" aria-live="polite">{tableToastText}</div>
          )}
        </div>

        {visualSeats.map((physIdx, visualIdx) => renderSeatArea(physIdx, visualIdx))}

        <PublicCards
          players={game.players}
          room={room}
          visualSeats={visualSeats}
          myUsername={myUsername}
          phase={game.phase}
          realCompare={realCompare}
        />

        <SeatBetMarkers
          players={game.players}
          room={room}
          visualSeats={visualSeats}
          gameStarted={!!game.gameStarted}
          hideForCompare={
            game.phase === 'comparing'
            || (game.phase === 'done' && realCompare)
          }
        />

        <AnimatedLayer
          dealAnim={dealAnim}
          chipAnim={chipAnim}
          centerMessage={null}
          renderDealCards
        />
      </main>

      {/* 底部 HUD */}
      <footer className="tea-hud">
        <div
          className={`self-timer${showSelfTimer ? ' show' : ''}${selfUrgency ? ` ${selfUrgency}` : ''}`}
          aria-hidden={!showSelfTimer}
        >
          <span className="label">{showSelfTimer ? (turnTimer ?? '') : '\u00a0'}</span>
          <div className="track">
            <div className="fill" style={{ width: `${showSelfTimer ? selfTimerRatio : 0}%` }} />
          </div>
          <button
            type="button"
            className="extend-turn-btn"
            onClick={handleExtendTurn}
            tabIndex={showSelfTimer ? 0 : -1}
            disabled={!showSelfTimer}
            aria-hidden={!showSelfTimer}
          >
            +60s
          </button>
          <span className="tip">请操作</span>
        </div>

        {/* 绝对定位叠在 HUD 上方；始终挂载以稳住 aria-live 区域 */}
        <div className="msg-feed" aria-live="polite">
          {game.messageFeed.map((item) => (
            <div key={item.id} className={`msg-feed-item kind-${item.kind}`}>
              {item.text}
            </div>
          ))}
        </div>

        <div className="self-row">
          <div className={`self-id${showSelfTimer ? ' my-turn' : ''}${selfUrgency ? ` ${selfUrgency}` : ''}`}>
            <div className="av-wrap">
              <Avatar
                nickname={mySeat?.nickname || user?.nickname || myUsername || '?'}
                avatarPath={getAvatar(myUsername)}
                size={28}
                timer={showSelfTimer ? turnTimer : undefined}
                timerMax={turnTimerMax}
                isKnocked={!!myPlayer && !myPlayer.folded && game.knockedThisRound.includes(myUsername)}
                urgency={selfUrgency}
              />
              {!!mySeat && mySeat.username === game.bankerUsername && (
                <span className="banker-badge badge">庄</span>
              )}
            </div>
            <div>
              <div className="nm">{mySeat?.nickname || user?.nickname || '未入座'}</div>
              <div className={`sk${showAddBuyInHint ? ' sk-low' : ''}`}>
                {mySeat ? myTotalPot : '—'}
                {showAddBuyInHint && (
                  <button
                    type="button"
                    className="add-buyin-bubble"
                    onClick={() => setShowAddBuyIn(true)}
                  >
                    点击加簸
                  </button>
                )}
              </div>
            </div>
          </div>
          {privateGuide && <div className="hint-mini private-guide">{privateGuide}</div>}
        </div>

        <MyHand
          myHand={game.myHand}
          mySplit={game.mySplit}
          selected={game.selected}
          phase={game.phase}
          onCardClick={handleCardClick}
          realCompare={realCompare}
        />

        <ActionBar
          phase={room?.paused ? 'idle' : (isDealing ? 'dealing' : game.phase)}
          isMyTurn={!isDealing && !room?.paused && isMyTurn}
          isBetting={isBetting}
          betStarted={betStarted}
          currentBet={game.currentBet}
          minBet={game.minBet}
          maxBet={game.maxBet}
          playerChips={myPlayer?.pot ?? 0}
          playerRoundCommitted={myPlayer?.committed ?? myPlayer?.roundCommitted ?? 0}
          canShowSanhua={!!myPlayer?.canShowSanhua && !room?.paused}
          selectedCount={game.selected.length}
          splitConfirmed={!!game.mySplit && game.phase === 'selecting'}
          canHostStart={!!room && isHostUser && !room.gameStarted && allReady}
          canReady={canReady}
          isReady={!!mySeat?.ready}
          raiseAmount={raiseAmount}
          onRaiseAmountChange={setRaiseAmount}
          onPlayerAction={handleAction}
          onConfirmSplit={handleConfirmSplit}
          onClearSplitSelection={() => {
            game.setSelected([]);
            game.setMySplit(null);
          }}
          onStartGame={handleStartGame}
          onReady={handleReady}
          onHintChange={setActionHint}
        />
      </footer>

      {/* 菜单弹层：观战 / 加簸 / 返回 */}
      {showMenu && (
        <div className="menu-backdrop open" onClick={closeMenu} role="presentation">
          <div className="menu-sheet" onClick={(e) => e.stopPropagation()} role="menu">
            <div className="grab" />
            <button
              className="menu-item"
              type="button"
              onClick={() => { closeMenu(); setShowSpectators(true); }}
            >
              观战席 <span>{spectators.length}</span>
            </button>
            {room?.seats.some((s) => s?.username === myUsername) && (
              <button
                className="menu-item"
                type="button"
                onClick={() => { closeMenu(); setShowAddBuyIn(true); }}
              >
                加簸 <span>下局生效</span>
              </button>
            )}
            {!game.gameStarted && room?.seats.some((s) => s?.username === myUsername) && (
              <button className="menu-item" type="button" onClick={() => { handleStandUp(); closeMenu(); }}>
                离开座位
              </button>
            )}
            {room && myUsername === room.host && room.gameStarted && (
              <button
                className="menu-item"
                type="button"
                onClick={() => {
                  if (room.paused) handleResumeGame();
                  else handlePauseGame();
                  closeMenu();
                }}
              >
                {room.paused ? '恢复游戏' : '暂停游戏'}
                <span>{room.paused ? '继续对局' : '冻结计时'}</span>
              </button>
            )}
            {room && myUsername === room.host && room.gameStarted && !room.endAfterHand && (
              <button
                className="menu-item danger"
                type="button"
                onClick={() => {
                  if (!confirm('确认本局结束后结算整场对局？')) return;
                  handleHostEndAfterHand();
                  closeMenu();
                }}
              >
                本局后结算 <span>提前结束</span>
              </button>
            )}
            {room && myUsername === room.host && room.gameStarted && room.endAfterHand && (
              <div className="menu-item" style={{ opacity: 0.7, pointerEvents: 'none' }}>
                已预约结算 <span>本局结束后</span>
              </div>
            )}
            {room && myUsername === room.host && room.gameStarted && (
              <button
                className="menu-item"
                type="button"
                onClick={() => { closeMenu(); setShowExtendTime(true); }}
              >
                加时 <span>延长对局</span>
              </button>
            )}
            <button className="menu-item danger" type="button" onClick={() => { handleLeaveRoom(); closeMenu(); }}>
              返回大厅
            </button>
          </div>
        </div>
      )}

      {showSpectators && (
        <div className="menu-backdrop open" onClick={() => setShowSpectators(false)} role="presentation">
          <div className="menu-sheet spectator-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="grab" />
            <div className="spectator-sheet-title">观战席 · {spectators.length}</div>
            {spectators.length === 0 ? (
              <div className="spectator-sheet-empty">暂无观战</div>
            ) : (
              <div className="spectator-sheet-list">
                {spectators.map((member) => (
                  <div key={member.username} className="spectator-sheet-item">
                    <Avatar nickname={member.nickname} avatarPath={getAvatar(member.username)} size={28} />
                    <span>{member.nickname}</span>
                  </div>
                ))}
              </div>
            )}
            <button className="menu-item" type="button" onClick={() => setShowSpectators(false)}>关闭</button>
          </div>
        </div>
      )}

      <HistoryDrawer roundHistory={game.roundHistory} />

      {buyInDecision && myBrokePending && (
        <div className="modal-overlay">
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">簸簸归零</div>
            <p className="modal-desc">
              你的簸簸已输光。可加簸继续本场，或立即退出（若退出后不足两人则整场结算）。
            </p>
            <div className="buyin-options">
              {[100, 200, 300, 500].map((amount) => (
                <label key={amount} className="buyin-option">
                  <input
                    type="radio"
                    name="add-buyin-decision"
                    value={amount}
                    checked={addBuyInAmount === amount}
                    onChange={() => setAddBuyInAmount(amount)}
                  />
                  加簸 {amount}
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-primary"
                onClick={() => handleBuyInDecision('continue', addBuyInAmount)}
              >
                加簸继续
              </button>
              <button className="btn" onClick={() => handleBuyInDecision('settle')}>
                立即退出
              </button>
            </div>
          </div>
        </div>
      )}

      {game.settlement && game.settlement.length > 0 && (
        <div className="modal-overlay" onClick={handleLeaveRoom}>
          <div className="modal-content settlement-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">游戏结算</div>
            {game.potSplit && game.potSplit.pot > 0 && (
              <div className="settlement-pot-split">
                <div className="settlement-pot-split-title">终局底池平分退回</div>
                <p className="settlement-pot-split-desc">
                  遗留底池 {game.potSplit.pot} 分已按在座人数均分
                  {game.potSplit.recipientCount
                    ? `（${game.potSplit.recipientCount} 人各 ${game.potSplit.base ?? Math.floor(game.potSplit.pot / game.potSplit.recipientCount)}`
                      + (game.potSplit.remainder ? `，余数 ${game.potSplit.remainder} 归庄家` : '')
                      + '）'
                    : ''}
                  。常见于最后一手全员休、作废局底注/芒果未带入下一手时。
                </p>
              </div>
            )}
            <div className="settlement-body">
              {game.settlement.map((p) => {
                const refund = game.potSplit?.shares?.[p.username] || 0;
                return (
                  <div key={p.username} className={`settlement-row${p.delta > 0 ? ' winner' : p.delta < 0 ? ' loser' : ''}`}>
                    <span className="settlement-name">
                      {p.nickname}
                      {refund > 0 && <span className="settlement-refund-tag">退回 +{refund}</span>}
                    </span>
                    <span className="settlement-score">初始: {p.initial}</span>
                    <span className="settlement-score">剩余: {p.final}</span>
                    <span className="settlement-delta">
                      {p.delta > 0 ? `+${p.delta}` : p.delta < 0 ? `${p.delta}` : '平0'}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={handleLeaveRoom}>返回大厅</button>
            </div>
          </div>
        </div>
      )}

      {showBuyIn && room && (
        <div className="modal-overlay" onClick={() => setShowBuyIn(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">{buyInMode === 'topup' ? '加簸入座' : '买入积分'}</div>
            <p className="modal-desc">
              {buyInMode === 'topup'
                ? `你离开时筹码为 ${carryChips}，不够当前最少带入 ${room.minBuyIn || 100}，请加簸。加簸后入座筹码 = ${carryChips} + 加簸额。`
                : room.gameStarted
                  ? '对局已开始：确认后入座。若本手进行中则先观战，下一局起正式打牌。'
                  : '请选择本局买入分'}
            </p>
            <div className="buyin-options">
              {(buyInMode === 'topup'
                ? (() => {
                    const minBuy = room.minBuyIn || 100;
                    const gap = Math.max(0, minBuy - carryChips);
                    const presets = [gap, minBuy, minBuy * 2, minBuy * 3, minBuy * 5]
                      .filter((n) => n > 0)
                      .filter((n, i, arr) => arr.indexOf(n) === i)
                      .sort((a, b) => a - b);
                    return presets;
                  })()
                : [room.minBuyIn || 100, (room.minBuyIn || 100) * 2, (room.minBuyIn || 100) * 3, (room.minBuyIn || 100) * 5]
              ).map((amount) => (
                <label key={amount} className="buyin-option">
                  <input type="radio" name="buyin" value={amount} checked={buyInAmount === amount} onChange={() => setBuyInAmount(amount)} />
                  {buyInMode === 'topup' ? `加簸 ${amount} 分（入座 ${carryChips + amount}）` : `${amount} 分`}
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={handleSitConfirm}>确认</button>
              <button className="btn" onClick={() => setShowBuyIn(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {showSeatChange && room && pendingSeatIdx != null && (
        <div className="modal-overlay" onClick={() => { setShowSeatChange(false); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">换到此座</div>
            <p className="modal-desc">
              确认换到 {pendingSeatIdx + 1} 号座？簸数不变，不需要重新买入。
            </p>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={handleSeatChangeConfirm}>确认换座</button>
              <button className="btn" onClick={() => setShowSeatChange(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {showExtendTime && room && (
        <div className="modal-overlay" onClick={() => setShowExtendTime(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">延长对局</div>
            <p className="modal-desc">
              当前剩余 {formatCountdown(room.endsAt, nowTs)}。加时后本手打完仍可继续开下一局。
            </p>
            <div className="buyin-options">
              {EXTEND_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className="btn"
                  style={{ width: '100%', marginBottom: 8 }}
                  onClick={() => {
                    handleExtendTime(opt.value);
                    setShowExtendTime(false);
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowExtendTime(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {showAddBuyIn && room && (
        <div className="modal-overlay" onClick={() => setShowAddBuyIn(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">加簸</div>
            <p className="modal-desc">
              {myAvailableChips <= lowChipThreshold
                ? `当前簸簸 ${myAvailableChips}（≤ 最少带入 ${lowChipThreshold}）。建议加簸，以免庄家付底注后无法继续（下局生效）。`
                : '追加筹码将在本局结算后、下一局生效'}
            </p>
            <div className="buyin-options">
              {[100, 200, 300, 500, 1000].map((amount) => (
                <label key={amount} className="buyin-option">
                  <input
                    type="radio"
                    name="add-buyin"
                    value={amount}
                    checked={addBuyInAmount === amount}
                    onChange={() => setAddBuyInAmount(amount)}
                  />
                  {amount} 分
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (addBuyInAmount > 0) handleAddBuyIn(addBuyInAmount);
                  setShowAddBuyIn(false);
                }}
              >
                确认加簸
              </button>
              <button className="btn" onClick={() => setShowAddBuyIn(false)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
