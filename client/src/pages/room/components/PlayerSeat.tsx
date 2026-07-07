import { useGameStore, type GamePlayer } from '@/stores/gameStore';
import { TURN_TIME_SECONDS } from '../constants';

export function Avatar({ nickname, avatarPath, size = 56, timer, isKnocked }: {
  nickname: string;
  avatarPath?: string;
  size?: number;
  timer?: number;
  isKnocked?: boolean;
}) {
  const initial = nickname?.[0] || '?';
  return (
    <div className="avatar-wrap" style={{ width: size, height: size }}>
      {isKnocked && <div className="burning-effect" />}
      <div className="avatar" style={{ width: size, height: size }}>
        {avatarPath ? <img src={avatarPath} alt="" /> : <span>{initial}</span>}
      </div>
      {timer != null && timer >= 0 && (
        <svg className="timer-ring" width={size + 8} height={size + 8} style={{ top: -4, left: -4 }}>
          <circle
            cx={(size + 8) / 2}
            cy={(size + 8) / 2}
            r={size / 2}
            fill="none"
            stroke="rgba(212,175,55,0.3)"
            strokeWidth={3}
          />
          <circle
            cx={(size + 8) / 2}
            cy={(size + 8) / 2}
            r={size / 2}
            fill="none"
            stroke="#d4af37"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * (size / 2)}`}
            strokeDashoffset={`${2 * Math.PI * (size / 2) * (1 - timer / TURN_TIME_SECONDS)}`}
            transform={`rotate(-90 ${(size + 8) / 2} ${(size + 8) / 2})`}
          />
        </svg>
      )}
      {timer != null && timer >= 0 && (
        <div className="timer-text">{timer}</div>
      )}
    </div>
  );
}

export function PlayerSeat({
  seat, physIdx, seatIdx, player, isMe, isMyTurn, gameStarted,
  avatarPath, timer, onSit, onReady, isBanker, isHost,
  isFolded, isDisconnected, isKnocked
}: {
  seat: { username: string; nickname: string; buyIn: number; ready?: boolean; avatar_path?: string } | null;
  physIdx: number;
  seatIdx: number;
  player?: GamePlayer;
  isMe: boolean;
  isMyTurn: boolean;
  gameStarted: boolean;
  avatarPath?: string;
  timer?: number;
  onSit: (visualIdx: number) => void;
  onReady: () => void;
  isBanker?: boolean;
  isHost?: boolean;
  isFolded?: boolean;
  isDisconnected?: boolean;
  isKnocked?: boolean;
}) {
  const seatNum = physIdx + 1;
  const bankerHighlight = useGameStore((s) => s.bankerHighlight);
  const isHighlight = seat ? bankerHighlight === seat.username : false;
  if (seat && isMe) {
    return (
      <div className={`seat-slot seat-vpos-${seatIdx} is-me self-seat-slot`}>
        <div className="seat-box self-seat-box">
          <div className="seat-name">{seat.nickname}</div>
          <div className={`self-chip-stack${isMyTurn ? ' turn-active' : ''}`}>
            <span className="chip-dot" />
            <strong>{player?.pot ?? seat.buyIn}</strong>
          </div>
          {gameStarted && !!player?.committed && player.committed > 0 && (
            <div className="seat-bet-chip" aria-label={`${seat.nickname}\u5df2\u4e0b\u6ce8${player.committed}`}>
              <span className="chip-dot" />
              <span>{player.committed}</span>
            </div>
          )}
          {player?.sanhuaShown && <div className="sanhua-badge">三花</div>}
          {!gameStarted && !isHost && (
            <button className="ready-btn" onClick={onReady}>{seat.ready ? '\u53d6\u6d88' : '\u51c6\u5907'}</button>
          )}
          {!gameStarted && isHost && (
            <div className="host-tag">{"\u623f\u4e3b"}</div>
          )}
        </div>
      </div>
    );
  }

  if (seat) {
    return (
      <div className={`seat-slot seat-vpos-${seatIdx}${isMe ? ' is-me' : ''}`}>
        <div className="seat-box">
          <div className="seat-name">{seat.nickname}</div>
          <div className={`seat-avatar-row${isHighlight ? ' banker-highlight' : ''}${isFolded ? ' folded' : ''}${isDisconnected ? ' disconnected' : ''}${isMyTurn ? ' turn-active' : ''}${isKnocked ? ' knocked' : ''}${!gameStarted && !isMe && seat.ready ? ' ready' : ''}`}>
            <Avatar nickname={seat.nickname} avatarPath={seat.avatar_path || avatarPath} size={isMe ? 58 : 42} timer={isMyTurn ? timer : undefined} isKnocked={isKnocked} />
            {isBanker && <span className="banker-badge">庄</span>}
            {isFolded && <span className="fold-badge">弃</span>}
            {player?.sanhuaShown && <span className="sanhua-badge">三花</span>}
            {isDisconnected && <span className="disconnect-badge">离</span>}
          </div>
          <div className="seat-stack-row">
            <span className="seat-stack-label">簸</span>
            <span className="seat-score">{player?.pot ?? seat.buyIn}</span>
          </div>
          {gameStarted && !!player?.committed && player.committed > 0 && (
            <div className="seat-bet-chip" aria-label={`${seat.nickname}已下注${player.committed}`}>
              <span className="chip-dot" />
              <span>{player.committed}</span>
            </div>
          )}
          {!gameStarted && isMe && !isHost && (
            <button className="ready-btn" onClick={onReady}>{seat.ready ? '取消' : '准备'}</button>
          )}
          {!gameStarted && !isMe && seat.ready && (
            <div className="ready-mark">已准备</div>
          )}
          {!gameStarted && isHost && isMe && (
            <div className="host-tag">房主</div>
          )}
        </div>
      </div>
    );
  }

  if (gameStarted) {
    return (
      <div className={`seat-slot seat-vpos-${seatIdx}`}>
        <div className="empty-seat">
          <div className="empty-avatar">空</div>
          <div className="empty-num">{seatNum}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`seat-slot seat-vpos-${seatIdx}`}>
      <div className="empty-seat" onClick={() => onSit(seatIdx)}>
        <div className="empty-avatar">坐下</div>
        <div className="empty-num">{seatNum}</div>
      </div>
    </div>
  );
}
