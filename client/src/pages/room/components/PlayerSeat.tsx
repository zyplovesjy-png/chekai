import type { GamePlayer } from '@/stores/gameStore';
import { TURN_TIME_SECONDS } from '../constants';

export function getTimerUrgency(timer?: number | null, max = TURN_TIME_SECONDS): '' | 'urgent' | 'critical' {
  if (timer == null || timer < 0 || max <= 0) return '';
  const ratio = timer / max;
  if (ratio <= 0.2) return 'critical';
  if (ratio <= 0.4) return 'urgent';
  return '';
}

export function Avatar({ nickname, avatarPath, size = 38, timer, timerMax = TURN_TIME_SECONDS, isKnocked, urgency = '' }: {
  nickname: string;
  avatarPath?: string;
  size?: number;
  timer?: number;
  timerMax?: number;
  isKnocked?: boolean;
  urgency?: '' | 'urgent' | 'critical';
}) {
  const initial = nickname?.[0] || '?';
  const ringSize = size + 10;
  const r = size / 2 + 2;
  const circ = 2 * Math.PI * r;
  const max = Math.max(1, timerMax || TURN_TIME_SECONDS);
  const ratio = timer != null && timer >= 0 ? Math.max(0, Math.min(1, timer / max)) : 1;
  const stroke = urgency === 'critical'
    ? 'var(--timer-crit, #ff4d4d)'
    : urgency === 'urgent'
      ? 'var(--timer-warn, #ff8a3d)'
      : 'var(--timer, #2ee6c8)';

  return (
    <div className={`avatar-wrap${urgency ? ` ${urgency}` : ''}`} style={{ width: size, height: size }}>
      {isKnocked && (
        <div className="flame" aria-hidden="true">
          <span /><span /><span />
        </div>
      )}
      {isKnocked && <div className="burning-effect" />}
      {timer != null && timer >= 0 && (
        <svg className="timer-ring" width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`}>
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={r}
            fill="none"
            stroke="rgba(46,230,200,0.18)"
            strokeWidth={size <= 28 ? 2.5 : 3}
          />
          <circle
            className="timer-ring-fg"
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth={size <= 28 ? 2.5 : 3}
            strokeLinecap="round"
            strokeDasharray={`${circ}`}
            strokeDashoffset={`${circ * (1 - ratio)}`}
            transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
          />
        </svg>
      )}
      <div className="avatar" style={{ width: size, height: size }}>
        {avatarPath ? <img src={avatarPath} alt="" /> : <span>{initial}</span>}
      </div>
    </div>
  );
}

export function PlayerSeat({
  seat, physIdx, seatIdx, player, isMe, isMyTurn, gameStarted,
  avatarPath, timer, timerMax = TURN_TIME_SECONDS, onSit, onReady: _onReady, isBanker, isHost: _isHost,
  isFolded, isDisconnected, isKnocked, brokeStatus,
  emptySeatAction = 'sit',
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
  timerMax?: number;
  onSit: (visualIdx: number) => void;
  onReady: () => void;
  isBanker?: boolean;
  isHost?: boolean;
  isFolded?: boolean;
  isDisconnected?: boolean;
  isKnocked?: boolean;
  brokeStatus?: 'pending' | 'rebought' | 'exited' | null;
  /** 空座交互：sit 开局前坐下 / join 观战加入 / change 换座 / none 仅展示 */
  emptySeatAction?: 'sit' | 'join' | 'change' | 'none';
}) {
  const seatNum = physIdx + 1;
  const totalPot = (player?.pot ?? seat?.buyIn ?? 0) + (player?.committed || 0);
  const brokeClass = brokeStatus === 'pending'
    ? ' broke-pending'
    : brokeStatus === 'rebought'
      ? ' broke-rebought'
      : brokeStatus === 'exited'
        ? ' broke-exited'
        : '';
  const brokeBadgeText = brokeStatus === 'pending'
    ? '待加簸'
    : brokeStatus === 'rebought'
      ? '已加簸'
      : brokeStatus === 'exited'
        ? '已退出'
        : '';

  if (seat && isMe) {
    return <div className={`seat-slot seat-vpos-${seatIdx} is-me self-seat-slot seat-hidden`} aria-hidden="true" />;
  }

  if (seat) {
    const showTimer = isMyTurn && timer != null && timer >= 0;
    const urgency = showTimer ? getTimerUrgency(timer, timerMax) : '';
    return (
      <div
        className={[
          `seat-slot seat-vpos-${seatIdx} tea-seat`,
          isFolded ? 'fold' : '',
          isMyTurn ? 'turn' : '',
          urgency,
          isKnocked ? 'knock' : '',
          brokeClass,
          isDisconnected ? 'disconnected' : '',
          !gameStarted && seat.ready ? 'ready' : '',
        ].filter(Boolean).join(' ')}
      >
        <div className="seat-name name">{seat.nickname}</div>
        <div className="avatar-wrap-outer">
          <Avatar
            nickname={seat.nickname}
            avatarPath={seat.avatar_path || avatarPath}
            size={38}
            timer={isMyTurn ? timer : undefined}
            timerMax={timerMax}
            isKnocked={isKnocked}
            urgency={urgency}
          />
          {isBanker && <span className="banker-badge badge">庄</span>}
          {isFolded && <span className="fold-badge">弃</span>}
          {player?.sanhuaShown && <span className="sanhua-badge">三花</span>}
          {isDisconnected && <span className="disconnect-badge">离</span>}
          {brokeBadgeText && <span className="broke-badge">{brokeBadgeText}</span>}
        </div>
        <div className="seat-stack-row stack">
          <span className="seat-score">{totalPot}</span>
        </div>
        {!gameStarted && seat.ready && (
          <div className="ready-mark">已准备</div>
        )}
      </div>
    );
  }

  const hint =
    emptySeatAction === 'join' ? '加入'
      : emptySeatAction === 'change' ? '换座'
        : emptySeatAction === 'sit' ? '坐下'
          : null;
  const clickable = emptySeatAction !== 'none';

  return (
    <div className={`seat-slot seat-vpos-${seatIdx} tea-seat`}>
      <div
        className={`empty-seat${clickable ? '' : ' empty-seat-locked'}`}
        onClick={clickable ? () => onSit(seatIdx) : undefined}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        aria-label={clickable ? `${hint}到 ${seatNum} 号座` : `${seatNum} 号座空位`}
      >
        <div className="empty-avatar seat-num-avatar">{seatNum}</div>
        {hint && <div className="empty-sit-hint">{hint}</div>}
      </div>
    </div>
  );
}
