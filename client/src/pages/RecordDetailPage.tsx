import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApi } from '@/hooks/useApi';
import { useAuthStore } from '@/stores/authStore';
import { formatDurationLabel } from '@/stores/roomStore';
import { CardView } from '@/pages/room/components/CardView';
import type { Card } from '@/stores/gameStore';

type HandFilter = 'all' | 'won' | 'lost';

const HAND_REASON_CN: Record<string, string> = {
  compare: '比牌',
  all_folded: '独赢',
  rest_cross: '全休',
  all_matched: '跟平',
  all_in_showdown: '全下比牌',
  all_sanhua: '三花',
};

const SESSION_REASON_CN: Record<string, string> = {
  time_limit: '到达时长上限',
  host_end: '房主提前结束',
  round_limit: '达到局数上限',
  players: '在座不足',
  buyin_exit: '破产离场结算',
  disbanded: '房间解散',
};

function handReasonLabel(reason?: string | null) {
  if (!reason) return '';
  return HAND_REASON_CN[reason] || reason;
}

function sessionReasonLabel(reason?: string | null) {
  if (!reason) return '-';
  return SESSION_REASON_CN[reason] || reason;
}

function PlayerStatusTags({ p, endReason }: { p: any; endReason?: string | null }) {
  const folded = !!p.folded;
  const rested = !!p.rested || (!folded && endReason === 'rest_cross');
  if (!folded && !rested) return null;
  return (
    <>
      {folded && <span className="history-fold-tag">弃</span>}
      {!folded && rested && <span className="history-rest-tag">休</span>}
    </>
  );
}

function cardFromId(id: string): Card {
  if (id === 'joker') {
    return { id: 'joker', color: 'joker', rank: 'JK', suit: '★', cnName: '大鬼', cnChar: '鬼', cardPoints: 6, order: 50 };
  }

  // 红 3 是牌库中唯一没有副本序号的普通牌。
  if (id === 'r3') {
    return { id, color: 'red', rank: '3', suit: '♥', cnName: id, cnChar: '3', cardPoints: 3, order: 50 };
  }

  // 其余牌 ID 格式为：颜色 + 点数 + 副本序号，例如 rQ1、r101、b51。
  // 必须单独解析最后一位序号，不能把 r101 尾部的 "101" 整体当成序号。
  const matched = id.match(/^([rb])(Q|J|10|[2-9])([12])$/);
  const color = matched?.[1] === 'r' ? 'red' : 'black';
  const rank = matched?.[2] || '?';
  const copy = matched?.[3];
  const suit = color === 'red'
    ? (copy === '1' ? '♥' : '♦')
    : (copy === '1' ? '♠' : '♣');
  return {
    id,
    color,
    rank,
    suit,
    cnName: id,
    cnChar: rank,
    cardPoints: 0,
    order: 0,
  };
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

function PlayerHandCards({ p }: { p: any }) {
  const headIds: string[] = p.headIds || [];
  const tailIds: string[] = p.tailIds || [];
  const cardIds: string[] = p.cardIds || [];
  const hasSplit = headIds.length > 0 || tailIds.length > 0;

  if (hasSplit) {
    const head = headIds.map(cardFromId);
    const tail = tailIds.map(cardFromId);
    return (
      <div className="history-cards">
        {head.length > 0 && (
          <div className="history-card-group">
            <span className="history-group-label">头</span>
            {head.map((c, i) => <HistoryCard key={`h${i}`} card={c} />)}
          </div>
        )}
        {head.length > 0 && tail.length > 0 && <div className="history-card-divider" />}
        {tail.length > 0 && (
          <div className="history-card-group">
            <span className="history-group-label">尾</span>
            {tail.map((c, i) => <HistoryCard key={`t${i}`} card={c} />)}
          </div>
        )}
      </div>
    );
  }

  if (cardIds.length === 0) {
    return <div className="history-fold-only">无牌</div>;
  }

  return (
    <div className="history-cards">
      <div className="history-card-group">
        {cardIds.map((cid, i) => (
          <HistoryCard key={`${cid}-${i}`} card={cardFromId(cid)} dealLabel={String(i + 1)} />
        ))}
      </div>
    </div>
  );
}

export default function RecordDetailPage({ admin = false }: { admin?: boolean }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const api = useApi();
  const user = useAuthStore((s) => s.user);
  const [session, setSession] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [handFilter, setHandFilter] = useState<HandFilter>('all');
  /** 管理员视角：按所选玩家筛选输赢；玩家视角固定为自己 */
  const [focusUsername, setFocusUsername] = useState('');

  useEffect(() => {
    if (admin && user?.role !== 'admin') {
      navigate('/lobby', { replace: true });
    }
  }, [admin, user, navigate]);

  useEffect(() => {
    (async () => {
      const r = await api(`/api/records/${id}`);
      if (r.ok) setSession(r.session);
      else setError(r.msg || '加载失败');
    })();
  }, [api, id]);

  const back = () => navigate(admin ? '/admin' : '/lobby');

  const formatTime = (ts: number) => (ts ? new Date(ts * 1000).toLocaleString() : '-');

  const sessionPlayers = useMemo(() => {
    if (!session) return [] as { username: string; nickname: string }[];
    const map = new Map<string, string>();
    for (const p of session.settlement || []) {
      map.set(p.username, p.nickname || p.username);
    }
    for (const hand of session.hands || []) {
      for (const p of hand.players || []) {
        if (!map.has(p.username)) map.set(p.username, p.nickname || p.username);
      }
    }
    return [...map.entries()].map(([username, nickname]) => ({ username, nickname }));
  }, [session]);

  useEffect(() => {
    if (!admin) {
      setFocusUsername(user?.username || '');
      return;
    }
    if (!sessionPlayers.length) {
      setFocusUsername('');
      return;
    }
    setFocusUsername((prev) => (
      prev && sessionPlayers.some((p) => p.username === prev)
        ? prev
        : sessionPlayers[0].username
    ));
  }, [admin, user?.username, sessionPlayers]);

  const focusPlayer = sessionPlayers.find((p) => p.username === focusUsername) || null;
  const filteredHands = useMemo(() => {
    const hands = session?.hands || [];
    if (handFilter === 'all' || !focusUsername) return hands;
    return hands.filter((hand: any) => {
      const target = (hand.players || []).find((p: any) => p.username === focusUsername);
      if (!target) return false;
      const delta = Number(target.delta) || 0;
      const won = !!target.isWinner || target.result === 'win';
      if (handFilter === 'won') return won;
      if (handFilter === 'lost') return !won && (target.result === 'loss' || delta < 0);
      return true;
    });
  }, [session, handFilter, focusUsername]);

  const filterLabels = admin
    ? ([['all', '全部'], ['won', '赢的局'], ['lost', '输的局']] as const)
    : ([['all', '全部'], ['won', '我赢的'], ['lost', '我输的']] as const);

  const emptyFilterText = (() => {
    if (handFilter === 'all') return '本场尚无手牌记录';
    const who = admin ? (focusPlayer?.nickname || '该玩家') : '你';
    return handFilter === 'won' ? `没有${who}赢的局` : `没有${who}输的局`;
  })();

  if (error) {
    return (
      <div className="auth-body">
        <div className="auth-wrap">
          <div className="lobby-card lobby-v2" style={{ padding: 24 }}>
            <p style={{ color: 'var(--red)' }}>{error}</p>
            <button className="btn" onClick={back}>返回</button>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="auth-body">
        <div className="auth-wrap">
          <div className="lobby-card lobby-v2" style={{ padding: 24, color: 'var(--text-dim)' }}>加载中…</div>
        </div>
      </div>
    );
  }

  const settlement = session.settlement || [];
  const potSplit = session.potSplit && session.potSplit.pot > 0 ? session.potSplit : null;
  const potSplitBase = potSplit
    ? (potSplit.base ?? (potSplit.recipientCount
      ? Math.floor(potSplit.pot / potSplit.recipientCount)
      : potSplit.pot))
    : 0;
  return (
    <div className="auth-body">
      <div className="auth-wrap">
        <div className="lobby-card lobby-v2">
          <div className="lobby-header">
            <div>
              <div className="auth-logo" style={{ fontSize: 20 }}>对局复盘</div>
              <div className="lobby-overview">
                {session.room_name} · 房号 {session.room_code}
              </div>
            </div>
            <button className="btn btn-small" onClick={back}>返回</button>
          </div>
          <div className="lobby-body record-detail-body">
            <div className="record-meta">
              <span>开始 {formatTime(session.started_at)}</span>
              <span>结束 {formatTime(session.ended_at)}</span>
              <span>
                {session.duration_minutes
                  ? `时长 ${formatDurationLabel(session.duration_minutes)}`
                  : session.round_limit
                    ? `原局数上限 ${session.round_limit}`
                    : '时长 —'}
              </span>
              {session.extended_minutes > 0 && (
                <span>加时 +{session.extended_minutes} 分</span>
              )}
              <span>{sessionReasonLabel(session.end_reason)}</span>
            </div>

            {settlement.length > 0 && (
              <div className="record-settlement">
                <div className="record-settlement-title">本房间最终结算</div>
                {potSplit && (
                  <div className="record-pot-split">
                    <div className="record-pot-split-badge">底池平分退回</div>
                    <p className="record-pot-split-desc">
                      终局遗留底池 {potSplit.pot} 分已均分给在座玩家
                      {potSplit.recipientCount
                        ? `（${potSplit.recipientCount} 人各 ${potSplitBase}`
                          + (potSplit.remainder ? `，余数 ${potSplit.remainder} 归庄家` : '')
                          + '）'
                        : ''}
                      。常见于最后一手全员休等作废局，底注/芒果未带入下一手时。
                    </p>
                  </div>
                )}
                <div className="record-settlement-body">
                  {settlement.map((p: any) => {
                    const delta = Number(p.delta) || 0;
                    const focused = admin && p.username === focusUsername;
                    const refund = Number(potSplit?.shares?.[p.username]) || 0;
                    return (
                      <button
                        key={p.username}
                        type="button"
                        className={`record-settlement-row${delta > 0 ? ' winner' : delta < 0 ? ' loser' : ''}${focused ? ' focused' : ''}`}
                        onClick={() => {
                          if (!admin) return;
                          setFocusUsername(p.username);
                          setHandFilter('all');
                        }}
                        disabled={!admin}
                      >
                        <span className="record-settlement-name">
                          {p.nickname}
                          {refund > 0 && (
                            <span className="record-refund-tag">退回 +{refund}</span>
                          )}
                        </span>
                        <span className="record-settlement-score">初始 {p.initial}</span>
                        <span className="record-settlement-score">剩余 {p.final}</span>
                        <span className="record-settlement-delta">
                          {delta > 0 ? `+${delta}` : String(delta)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {admin && (
                  <div className="record-settlement-hint">点击玩家可切换下方筛选视角</div>
                )}
              </div>
            )}

            <div className="record-hand-toolbar">
              <div className="record-hand-toolbar-label">逐局记录</div>
              <div className="record-hand-filters">
                {admin && sessionPlayers.length > 0 && (
                  <select
                    className="record-player-select"
                    value={focusUsername}
                    onChange={(e) => {
                      setFocusUsername(e.target.value);
                      setHandFilter('all');
                    }}
                    aria-label="按玩家筛选"
                  >
                    {sessionPlayers.map((p) => (
                      <option key={p.username} value={p.username}>{p.nickname}</option>
                    ))}
                  </select>
                )}
                {filterLabels.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`btn btn-small${handFilter === key ? ' active' : ''}`}
                    onClick={() => setHandFilter(key)}
                    disabled={key !== 'all' && !focusUsername}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {(session.hands || []).length === 0 ? (
              <div className="room-list-empty">本场尚无手牌记录</div>
            ) : filteredHands.length === 0 ? (
              <div className="room-list-empty">{emptyFilterText}</div>
            ) : (
              filteredHands.map((hand: any) => (
                <div key={hand.id} className="hand-block">
                  <div className="hand-title">
                    第 {hand.hand_no} 局
                    <span className="hand-reason">{handReasonLabel(hand.end_reason)}</span>
                  </div>
                  <div className="history-body record-history-body">
                    {hand.players.map((p: any) => {
                      const delta = Number(p.delta) || 0;
                      const won = !!p.isWinner || p.result === 'win';
                      const isFocus = p.username === focusUsername;
                      return (
                        <div
                          key={p.username}
                          className={`history-player${won ? ' winner' : delta < 0 ? ' loser' : ''}${isFocus ? ' is-me' : ''}`}
                        >
                          <div className="history-player-name">
                            {p.nickname}
                            {isFocus ? (admin ? ' · 视角' : ' · 我') : ''}
                            {hand.banker_username === p.username && (
                              <span className="history-banker-tag">庄</span>
                            )}
                            <PlayerStatusTags p={p} endReason={hand.end_reason} />
                          </div>
                          <PlayerHandCards p={p} />
                          <div className="history-delta">
                            <span className="history-delta-label">净</span>
                            {delta > 0 ? `+${delta}` : String(delta)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
