import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useRoomStore } from '@/stores/roomStore';
import type { Card } from '@/stores/gameStore';
import { isRealCompare } from '@/stores/gameStore';
import { useApi } from '@/hooks/useApi';
import { CardView } from './room/components/CardView';
import { MyHand } from './room/components/MyHand';
import { PlayerSeat, Avatar, getTimerUrgency } from './room/components/PlayerSeat';
import { PublicCards } from './room/components/PublicCards';
import { SeatBetMarkers } from './room/components/SeatBetMarkers';
import { useRoomGameController } from './room/useRoomGameController';
import { ActionBar } from './room/components/ActionBar';
import { AnimatedLayer } from './room/components/AnimatedLayer';
import { PixiTableLayer } from './room/pixi/PixiTableLayer';
import { TURN_TIME_SECONDS } from './room/constants';
import { unlockAudio } from './room/sounds';
import { cardBackUrl } from './room/cardAssets';

/** 簸簸 ≤ 房间最少带入分时，在数字旁提示「点击加簸」 */
const DEFAULT_MIN_BUYIN = 100;

/* ========== 历史卡片组件（带发牌顺序标记） ========== */
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

/* ========== 主页面 ========== */
export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const api = useApi();
  const user = useAuthStore((s) => s.user);
  const myUsername = user?.username || '';
  const { room, setRoom } = useRoomStore();
  const pixiEnabled = import.meta.env.VITE_PIXI_TABLE === '1';

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const {
    game,
    showBuyIn,
    setShowBuyIn,
    buyInAmount,
    setBuyInAmount,
    showMenu,
    setShowMenu,
    showHistory,
    setShowHistory,
    viewingRound,
    setViewingRound,
    raiseAmount,
    setRaiseAmount,
    turnTimer,
    dealAnim,
    chipAnim,
    isDealing,
    visualSeats,
    currentActor,
    getAvatar,
    handleSit,
    handleSitConfirm,
    handleStandUp,
    handleReady,
    handleStartGame,
    handleDisband,
    handleLeaveRoom,
    handleAction,
    handleCardClick,
    handleConfirmSplit,
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
  const [actionHint, setActionHint] = useState('');

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
        : '';

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
        onSit={handleSit}
        onReady={handleReady}
        isBanker={isBanker}
        isHost={isHost}
        isFolded={isFolded}
        isDisconnected={isDisconnected}
        isKnocked={isKnocked}
        brokeStatus={brokeStatus}
      />
    );
  };

  const myBrokePending = !!buyInDecision
    && buyInDecision.players.some((p) => p.username === myUsername && !p.choice);

  const openMenu = () => setShowMenu(true);
  const closeMenu = () => setShowMenu(false);

  const showSelfTimer = !isDealing && ((isMyTurn && isBetting) || (isMyTurn && game.phase === 'selecting'));
  const selfUrgency = showSelfTimer ? getTimerUrgency(turnTimer) : '';
  const selfTimerRatio = Math.max(0, Math.min(100, ((turnTimer ?? 0) / TURN_TIME_SECONDS) * 100));
  const showActionOverlay = !isDealing && (
    (game.phase === 'selecting' && !game.mySplit)
    || (isMyTurn && isBetting)
  );

  return (
    <div className={`room-page tea-room${showActionOverlay ? ' action-open' : ''}`}>
      <header className="tea-top">
        <div className="tea-brand">
          <span className="tea-code">{room?.code || code || '--'}</span>
          <span className="tea-meta">
            {game.gameStarted ? game.round : 0}/{room?.roundLimit || 0}局
          </span>
          <span className="tea-phase" aria-live="polite">{phaseLabel}</span>
        </div>
        <div className="tea-top-tools">
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
        {showSelfTimer && (
          <div className={`self-timer show${selfUrgency ? ` ${selfUrgency}` : ''}`}>
            <span className="label">{turnTimer ?? ''}</span>
            <div className="track">
              <div className="fill" style={{ width: `${selfTimerRatio}%` }} />
            </div>
            <span className="tip">请操作</span>
          </div>
        )}

        {game.messageFeed.length > 0 && (
          <div className="msg-feed" aria-live="polite">
            {game.messageFeed.map((item) => (
              <div key={item.id} className={`msg-feed-item kind-${item.kind}`}>
                {item.text}
              </div>
            ))}
          </div>
        )}

        <div className="self-row">
          <div className={`self-id${showSelfTimer ? ' my-turn' : ''}${selfUrgency ? ` ${selfUrgency}` : ''}`}>
            <div className="av-wrap">
              <Avatar
                nickname={mySeat?.nickname || user?.nickname || myUsername || '?'}
                avatarPath={getAvatar(myUsername)}
                size={28}
                timer={showSelfTimer ? turnTimer : undefined}
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
          phase={isDealing ? 'dealing' : game.phase}
          isMyTurn={!isDealing && isMyTurn}
          isBetting={isBetting}
          betStarted={betStarted}
          currentBet={game.currentBet}
          minBet={game.minBet}
          maxBet={game.maxBet}
          playerChips={myPlayer?.pot ?? 0}
          playerRoundCommitted={myPlayer?.committed ?? myPlayer?.roundCommitted ?? 0}
          canShowSanhua={!!myPlayer?.canShowSanhua}
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

      {/* 菜单弹层：观战 / 历史 / 加簸 / 返回 */}
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
            <button
              className="menu-item"
              type="button"
              onClick={() => { closeMenu(); setShowHistory(true); setViewingRound(-1); }}
            >
              对局记录 <span>{game.roundHistory.length}</span>
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
            {room && myUsername === room.host && (
              <button className="menu-item danger" type="button" onClick={() => { handleDisband(); closeMenu(); }}>
                解散房间
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

      {showHistory && (
        game.roundHistory.length > 0 ? (() => {
        const defaultIdx = game.roundHistory.length >= 2 ? game.roundHistory.length - 2 : 0;
        const idx = viewingRound === -1 ? defaultIdx : viewingRound;
        const rec = game.roundHistory[idx];
        if (!rec) return null;
        return (
          <div className="history-panel">
            <div className="history-header">
              <button className="btn-sm" disabled={idx <= 0} onClick={() => setViewingRound(idx - 1)}>‹ 上一局</button>
              <span className="history-title">第 {rec.round} 局记录</span>
              <button className="btn-sm" disabled={idx >= game.roundHistory.length - 1} onClick={() => setViewingRound(idx + 1)}>下一局 ›</button>
            </div>
            <div className="history-body">
              {rec.players.map((p) => (
                <div key={p.username} className={`history-player${p.lastDelta > 0 ? ' winner' : p.lastDelta < 0 ? ' loser' : ''}`}>
                  <div className="history-player-name">
                    {p.nickname}
                    {p.username === rec.bankerUsername && <span className="history-banker-tag">庄</span>}
                    {p.folded && <span className="history-fold-tag">甩</span>}
                  </div>
                  <div className="history-cards">
                    {(() => {
                      const cards = p.hand || [];
                      if (cards.length === 0) {
                        return <div className="history-fold-only">无牌</div>;
                      }
                      // 有配牌：头尾分组；否则按发牌顺序一排展示全部
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
                  <div className="history-delta" title="本局净输赢 = 局末簸簸 − 局初簸簸（含底注/芒果/弃牌进池/比牌）">
                    <span className="history-delta-label">净</span>
                    {p.lastDelta > 0 ? `+${p.lastDelta}` : p.lastDelta < 0 ? `${p.lastDelta}` : '0'}
                    {(p.wins > 0 || p.losses > 0) && (
                      <span className="history-wl"> · {p.wins}胜{p.losses}负</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button className="btn-sm history-close" onClick={() => setShowHistory(false)}>关闭</button>
          </div>
        );
      })() : (
        <div className="history-panel history-panel-empty">
          <div className="history-header">
            <span className="history-title">对局记录</span>
          </div>
          <div className="history-empty-body">暂无对局记录</div>
          <button className="btn-sm history-close" onClick={() => setShowHistory(false)}>关闭</button>
        </div>
      ))}

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
            <div className="settlement-body">
              {game.settlement.map((p) => (
                <div key={p.username} className={`settlement-row${p.delta > 0 ? ' winner' : p.delta < 0 ? ' loser' : ''}`}>
                  <span className="settlement-name">{p.nickname}</span>
                  <span className="settlement-score">初始: {p.initial}</span>
                  <span className="settlement-score">剩余: {p.final}</span>
                  <span className="settlement-delta">
                    {p.delta > 0 ? `+${p.delta}` : p.delta < 0 ? `${p.delta}` : '平0'}
                  </span>
                </div>
              ))}
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
            <div className="modal-title">买入积分</div>
            <p className="modal-desc">请选择本局买入分</p>
            <div className="buyin-options">
              {[room.minBuyIn || 100, (room.minBuyIn || 100) * 2, (room.minBuyIn || 100) * 3, (room.minBuyIn || 100) * 5].map((amount) => (
                <label key={amount} className="buyin-option">
                  <input type="radio" name="buyin" value={amount} checked={buyInAmount === amount} onChange={() => setBuyInAmount(amount)} />
                  {amount} 分
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
