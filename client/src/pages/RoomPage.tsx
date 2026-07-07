﻿﻿﻿﻿﻿import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useRoomStore } from '@/stores/roomStore';
import type { Card } from '@/stores/gameStore';
import { useApi } from '@/hooks/useApi';
import { CardView } from './room/components/CardView';
import { MyHand } from './room/components/MyHand';
import { PlayerSeat } from './room/components/PlayerSeat';
import { PublicCards } from './room/components/PublicCards';
import { useRoomGameController } from './room/useRoomGameController';
import { ActionBar } from './room/components/ActionBar';
import { AnimatedLayer } from './room/components/AnimatedLayer';
import { PixiTableLayer } from './room/pixi/PixiTableLayer';

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
    handleAutoSplit,
    handleConfirmSplit,
    allReady,
    spectators,
    isMyTurn,
    isBetting,
    betStarted,
  } = useRoomGameController({ code, room, myUsername, navigate, api, setRoom });

  const myPlayer = game.players.find((player) => player.username === myUsername);
  const mySeat = room?.seats.find((seat) => seat?.username === myUsername) ?? null;
  const isHostUser = !!room && myUsername === room.host;
  const canReady = !!room && !room.gameStarted && !!mySeat && !isHostUser;
  const showActionOverlay = game.phase === 'selecting' || (isMyTurn && isBetting);
  const compareWinnerName = game.compareResult?.winner
    ? game.players.find((p) => p.username === game.compareResult?.winner)?.nickname || game.compareResult.winner
    : '';
  const tableMessage = game.centerMessage || (game.compareResult ? `本局胜者: ${compareWinnerName || '-'}` : '');

  // 渲染每个座位区域（头像+明牌+自己的手牌）
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
        timer={isMyTurnLocal ? turnTimer : undefined}
        onSit={handleSit}
        onReady={handleReady}
        isBanker={isBanker}
        isHost={isHost}
        isFolded={isFolded}
        isDisconnected={isDisconnected}
        isKnocked={isKnocked}
      />
    );
  };

  return (
    <div className={`room-page new-table${showActionOverlay ? ' action-open' : ''}`}>
      <header className="table-top-strip">
        <div className="top-nav-btn spectator-entry spectator-roster" aria-label={"\u89c2\u4f17\u5e2d"}>
          <div className="spectator-avatar-list">
            {spectators.slice(0, 5).map((member) => (
              <span key={member.username} className="spectator-avatar-dot" title={member.nickname}>
                {getAvatar(member.username) ? <img src={getAvatar(member.username)} alt="" /> : member.nickname.slice(0, 1)}
              </span>
            ))}
            {spectators.length > 5 && <strong>+{spectators.length - 5}</strong>}
          </div>
        </div>

        <div className="table-top-center" aria-hidden="true" />

        <button className="top-nav-btn history-entry" type="button" onClick={() => { setShowHistory(!showHistory); setViewingRound(-1); }}>
          <span>{"\u5bf9\u5c40\u8bb0\u5f55"}</span>
          <strong>{game.roundHistory.length}</strong>
        </button>
      </header>

      {showHistory && game.roundHistory.length > 0 && (() => {
        // 默认显示上一局；当前对局的前一局；viewingRound=-1 表示使用默认值
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
                      const headCards = p.split?.head?.length ? p.split.head : p.hand.slice(0, 2);
                      const tailCards = p.split?.tail?.length ? p.split.tail : p.hand.slice(2);
                      return (
                        <>
                          <div className="history-card-group">
                            <span className="history-group-label">{"\u5934"}</span>
                            {headCards.map((c, i) => <HistoryCard key={`h${i}`} card={c} />)}
                          </div>
                          <div className="history-card-divider" />
                          <div className="history-card-group">
                            <span className="history-group-label">{"\u5c3e"}</span>
                            {tailCards.map((c, i) => <HistoryCard key={`t${i}`} card={c} />)}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  <div className="history-delta">
                    {p.lastDelta > 0 ? `+${p.lastDelta}` : p.lastDelta < 0 ? `${p.lastDelta}` : '平0'}
                  </div>
                </div>
              ))}
            </div>
            <button className="btn-sm history-close" onClick={() => setShowHistory(false)}>关闭</button>
          </div>
        );
      })()}

      {/* 牌桌 */}
      <main className="game-area">
        <PixiTableLayer enabled={pixiEnabled} dealAnim={dealAnim} chipAnim={chipAnim} />

        {/* 桌面 */}
        <div className={`table-felt${pixiEnabled ? ' pixi-backed' : ''}`}>
          {game.gameStarted && (
            <div className="deck-pile">
              <div className="deck-count">{game.remainingCards}</div>
              <div className="deck-label">剩余</div>
            </div>
          )}
          <div className="table-global-message" aria-live="polite">{tableMessage}</div>
          <div className="pot-badge">
            <span className="pot-label">{"\u5e95\u6c60"}</span>
            <span className="pot-value">{game.potPi}</span>
          </div>
          {game.gameStarted && game.currentBet > 0 && (
            <div className="current-bet-marker" aria-label={`\u5f53\u524d\u4e0b\u6ce8 ${game.currentBet}`}>
              <span className="current-bet-dot" />
              <span>{game.currentBet}</span>
            </div>
          )}
          <div className="table-room-info">
            <span>{room?.name || '扯旋房间'}</span>
            <span>房号 {room?.code || '--'} · 第 {game.gameStarted ? game.round : 0}/{room?.roundLimit || 0} 局</span>
          </div>
        </div>
        {/* 座位 */}
        {visualSeats.map((physIdx, visualIdx) => renderSeatArea(physIdx, visualIdx))}

        {/* 公牌 */}
        <PublicCards
          players={game.players}
          room={room}
          visualSeats={visualSeats}
          myUsername={myUsername}
          phase={game.phase}
        />

        {/* 自己的手牌 */}
        <MyHand
          myHand={game.myHand}
          mySplit={game.mySplit}
          selected={game.selected}
          phase={game.phase}
          onCardClick={handleCardClick}
        />

        {/* 动画层：发牌动画 + 中央消息 */}
        <AnimatedLayer dealAnim={dealAnim} centerMessage={null} renderDealCards={!pixiEnabled} />
      </main>

      {/* 操作提示 */}
      <div className="hint-bar">
        {game.gameStarted ? (game.hintText || '等待操作...') : (
          room?.seats.some((s) => s?.username === myUsername)
            ? '等待房主开始游戏'
            : '请选择座位加入'
        )}
      </div>

      {/* 底部操作栏 */}
      <ActionBar
        phase={game.phase}
        isMyTurn={isMyTurn}
        isBetting={isBetting}
        betStarted={betStarted}
        currentBet={game.currentBet}
        minBet={game.minBet}
        maxBet={game.maxBet}
        playerChips={myPlayer?.pot ?? 0}
        playerRoundCommitted={myPlayer?.roundCommitted ?? 0}
        canShowSanhua={!!myPlayer?.canShowSanhua}
        selectedCount={game.selected.length}
        canHostStart={!!room && isHostUser && !room.gameStarted && allReady}
        canReady={canReady}
        isReady={!!mySeat?.ready}
        raiseAmount={raiseAmount}
        onRaiseAmountChange={setRaiseAmount}
        onMenu={() => setShowMenu(true)}
        onPlayerAction={handleAction}
        onAutoSplit={handleAutoSplit}
        onConfirmSplit={handleConfirmSplit}
        onClearSplitSelection={() => game.setSelected([])}
        onStartGame={handleStartGame}
        onReady={handleReady}
      />

      {/* 菜单弹层 */}
      {showMenu && (
        <div className="menu-popover" role="menu">
          {!game.gameStarted && room?.seats.some((s) => s?.username === myUsername) && (
            <button className="menu-popover-item" type="button" onClick={() => { handleStandUp(); setShowMenu(false); }}>{"\u79bb\u5f00\u5ea7\u4f4d"}</button>
          )}
          {room && myUsername === room.host && (
            <button className="menu-popover-item danger" type="button" onClick={() => { handleDisband(); setShowMenu(false); }}>{"\u89e3\u6563\u623f\u95f4"}</button>
          )}
          <button className="menu-popover-item" type="button" onClick={() => { handleLeaveRoom(); setShowMenu(false); }}>{"\u8fd4\u56de\u5927\u5385"}</button>
          <button className="menu-popover-close" type="button" aria-label={"\u5173\u95ed"} onClick={() => setShowMenu(false)}>{"\u00d7"}</button>
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

      {/* 买入弹层 */}
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

    </div>
  );
}
