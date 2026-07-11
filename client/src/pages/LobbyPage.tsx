import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useApi, apiUpload } from '@/hooks/useApi';
import { usePresence } from '@/hooks/usePresence';
import { DURATION_OPTIONS } from '@/stores/roomStore';

type Tab = 'rooms' | 'friends' | 'rank' | 'me';
type RankType = 'profit' | 'record' | 'winrate';

function Avatar({ path, name, size = 36 }: { path?: string | null; name?: string; size?: number }) {
  if (path) {
    return (
      <img
        className="avatar"
        src={path}
        alt=""
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="avatar-placeholder"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name?.[0] || '?'}
    </div>
  );
}

export default function LobbyPage() {
  const navigate = useNavigate();
  const api = useApi();
  const { user, token, clear, setUser, setAuth } = useAuthStore();
  const [tab, setTab] = useState<Tab>('rooms');
  const [rooms, setRooms] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [rankType, setRankType] = useState<RankType>('profit');
  const [rankRows, setRankRows] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [overview, setOverview] = useState({ onlineCount: 0, roomCount: 0 });

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDuration, setCreateDuration] = useState(120);
  const [createMinBuyIn, setCreateMinBuyIn] = useState(100);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');

  const [nickname, setNickname] = useState(user?.nickname || '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileMsg, setProfileMsg] = useState('');

  usePresence((data) => {
    setOverview({ onlineCount: data.onlineCount, roomCount: data.roomCount });
    if (data.rooms) setRooms(data.rooms);
  });

  useEffect(() => {
    if (user?.role === 'admin') navigate('/admin', { replace: true });
  }, [user, navigate]);

  const loadRooms = useCallback(async () => {
    const r = await api('/api/rooms/list');
    if (r.ok) setRooms(r.rooms || []);
  }, [api]);

  const loadFriends = useCallback(async () => {
    const r = await api('/api/friends');
    if (r.ok) setFriends(r.friends || []);
  }, [api]);

  const loadRank = useCallback(async () => {
    const r = await api(`/api/leaderboard?type=${rankType}`);
    if (r.ok) setRankRows(r.rows || []);
  }, [api, rankType]);

  const loadRecords = useCallback(async () => {
    const r = await api('/api/records?limit=20');
    if (r.ok) setRecords(r.sessions || []);
  }, [api]);

  const loadOverview = useCallback(async () => {
    const r = await api('/api/lobby/overview');
    if (r.ok) setOverview({ onlineCount: r.onlineCount, roomCount: r.roomCount });
  }, [api]);

  useEffect(() => {
    loadRooms();
    loadOverview();
    const t = setInterval(() => {
      loadRooms();
      loadOverview();
      if (tab === 'friends') loadFriends();
    }, 4000);
    return () => clearInterval(t);
  }, [loadRooms, loadOverview, loadFriends, tab]);

  useEffect(() => {
    if (tab === 'friends') loadFriends();
    if (tab === 'rank') loadRank();
    if (tab === 'me') loadRecords();
  }, [tab, loadFriends, loadRank, loadRecords]);

  useEffect(() => {
    if (tab === 'rank') loadRank();
  }, [rankType, tab, loadRank]);

  const handleLogout = () => {
    clear();
    navigate('/login', { replace: true });
  };

  const handleCreate = async () => {
    const r = await api('/api/rooms/create', {
      method: 'POST',
      body: JSON.stringify({ name: createName, durationMinutes: createDuration, minBuyIn: createMinBuyIn }),
    });
    if (r.ok) navigate(`/room/${r.room.code}`);
    else alert(r.msg || '创建失败');
  };

  const enterRoom = async (code: string) => {
    const r = await api('/api/rooms/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    if (r.ok || r.msg === '你已在该房间内') {
      navigate(`/room/${code}`);
    } else {
      alert(r.msg || '加入失败');
    }
  };

  const handleJoin = async () => {
    if (!joinCode || joinCode.length < 3) {
      setJoinError('请输入3位房间号');
      return;
    }
    setJoinError('');
    const r = await api('/api/rooms/join', {
      method: 'POST',
      body: JSON.stringify({ code: joinCode }),
    });
    if (r.ok) navigate(`/room/${r.room.code}`);
    else setJoinError(r.msg || '加入失败');
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    const formData = new FormData();
    formData.append('avatar', file);
    const r = await apiUpload('/api/user/avatar', formData, token);
    if (r.ok) {
      setUser({ avatar_path: r.avatar_path });
      setProfileMsg('头像已更新');
    }
  };

  const handleSaveProfile = async () => {
    setProfileMsg('');
    const r = await api('/api/user/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        nickname,
        oldPassword: oldPassword || undefined,
        newPassword: newPassword || undefined,
      }),
    });
    if (r.ok) {
      setUser({ nickname: r.profile.nickname });
      if (token) setAuth(token, { ...user!, nickname: r.profile.nickname, avatar_path: r.profile.avatar_path, role: r.profile.role });
      setOldPassword('');
      setNewPassword('');
      setProfileMsg('已保存');
    } else {
      setProfileMsg(r.msg || '保存失败');
    }
  };

  const formatTime = (ts: number) => {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="auth-body">
      <div className="auth-wrap">
        <div className="lobby-card lobby-v2">
          <div className="lobby-header">
            <div>
              <div className="auth-logo">扯 开</div>
              <div className="lobby-overview">
                在线 {overview.onlineCount} · 房间 {overview.roomCount}
              </div>
            </div>
            <div className="lobby-user">
              <Avatar path={user?.avatar_path} name={user?.nickname} />
              <span>{user?.nickname || '玩家'}</span>
              <button className="btn btn-small" onClick={handleLogout}>退出</button>
            </div>
          </div>

          <div className="lobby-tabs">
            {([
              ['rooms', '房间'],
              ['friends', '好友'],
              ['rank', '排行'],
              ['me', '我的'],
            ] as [Tab, string][]).map(([id, label]) => (
              <button
                key={id}
                className={`lobby-tab ${tab === id ? 'active' : ''}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="lobby-body">
            {tab === 'rooms' && (
              <>
                <div className="lobby-actions">
                  <button className="btn btn-primary" onClick={() => setShowCreate(true)}>创建房间</button>
                  <button className="btn" onClick={() => setShowJoin(true)}>加入房间</button>
                </div>
                <div className="room-list-section">
                  <div className="room-list-title">房间列表</div>
                  <div className="room-list">
                    {rooms.length === 0 ? (
                      <div className="room-list-empty">暂无房间，点击上方创建</div>
                    ) : (
                      rooms.map((room) => (
                        <div key={room.code} className="room-card" onClick={() => enterRoom(room.code)}>
                          <div className="room-card-header">
                            <span className="room-card-name">{room.name}</span>
                            <span className="room-card-code">房号 {room.code}</span>
                          </div>
                          <div className="room-card-info">
                            <span>{room.statusText || (room.gameStarted ? '已开局' : '等待中')}</span>
                            <span>房主 {room.host}</span>
                            <span>最少代入 {room.minBuyIn}分</span>
                            {room.canSpectate && <span className="tag-spectate">可观战</span>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}

            {tab === 'friends' && (
              <div className="friend-list">
                {friends.length === 0 ? (
                  <div className="room-list-empty">暂无好友账号</div>
                ) : (
                  friends.map((f) => (
                    <div key={f.username} className="friend-row">
                      <Avatar path={f.avatar_path} name={f.nickname} size={40} />
                      <div className="friend-meta">
                        <div className="friend-name">{f.nickname}</div>
                        <div className="friend-user">@{f.username}</div>
                      </div>
                      <span className={`online-dot ${f.online ? 'on' : ''}`}>
                        {f.online ? '在线' : '离线'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === 'rank' && (
              <>
                <div className="rank-tabs">
                  {([
                    ['profit', '净输赢'],
                    ['record', '胜负'],
                    ['winrate', '胜率'],
                  ] as [RankType, string][]).map(([id, label]) => (
                    <button
                      key={id}
                      className={`lobby-tab sm ${rankType === id ? 'active' : ''}`}
                      onClick={() => setRankType(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className={`rank-list rank-list--${rankType}`}>
                  {rankRows.length === 0 ? (
                    <div className="room-list-empty">暂无排行数据</div>
                  ) : (
                    rankRows.map((row, i) => {
                      const pos = i + 1;
                      const profit = Number(row.total_profit) || 0;
                      const wins = Number(row.wins) || 0;
                      const losses = Number(row.losses) || 0;
                      const ties = Number(row.ties) || 0;
                      const hands = Number(row.total_hands) || 0;
                      const winratePct = Math.round((Number(row.winrate) || 0) * 100);
                      const profitSign = profit > 0 ? '+' : '';
                      const metricTone =
                        rankType === 'profit'
                          ? (profit > 0 ? 'up' : profit < 0 ? 'down' : 'flat')
                          : rankType === 'winrate'
                            ? (winratePct >= 50 ? 'up' : winratePct > 0 ? 'flat' : 'down')
                            : (wins >= losses ? 'up' : 'down');

                      return (
                        <div
                          key={row.username}
                          className={`rank-row rank-row--data${pos <= 3 ? ` is-top-${pos}` : ''}`}
                        >
                          <div className="rank-row-main">
                            <span className="rank-pos">{String(pos).padStart(2, '0')}</span>
                            <div className={`rank-metric tone-${metricTone}`}>
                              {rankType === 'profit' && (
                                <>
                                  <span className="rank-metric-value">
                                    {profitSign}{profit}
                                  </span>
                                  <span className="rank-metric-unit">净输赢</span>
                                </>
                              )}
                              {rankType === 'record' && (
                                <>
                                  <span className="rank-metric-value rank-metric-record">
                                    <em>{wins}</em>
                                    <span className="rank-metric-sep">-</span>
                                    <em className="is-loss">{losses}</em>
                                    <span className="rank-metric-sep">-</span>
                                    <em className="is-tie">{ties}</em>
                                  </span>
                                  <span className="rank-metric-unit">胜 · 负 · 平</span>
                                </>
                              )}
                              {rankType === 'winrate' && (
                                <>
                                  <span className="rank-metric-value">
                                    {winratePct}
                                    <span className="rank-metric-pct">%</span>
                                  </span>
                                  <span className="rank-metric-unit">{hands} 局样本</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="rank-row-who">
                            <Avatar path={row.avatar_path} name={row.nickname} size={28} />
                            <div className="rank-who-meta">
                              <div className="rank-who-name">{row.nickname}</div>
                              <div className="rank-who-sub">
                                {rankType === 'profit' && `${hands} 局`}
                                {rankType === 'record' && `${hands} 局 · 净 ${profit > 0 ? '+' : ''}${profit}`}
                                {rankType === 'winrate' && `${wins}胜 ${losses}负`}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}

            {tab === 'me' && (
              <div className="profile-panel">
                <div className="avatar-upload">
                  <Avatar path={user?.avatar_path} name={user?.nickname} size={72} />
                </div>
                <label className="btn btn-small" style={{ display: 'inline-block', cursor: 'pointer', marginBottom: 16 }}>
                  更换头像
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
                </label>
                <div className="form-row">
                  <label>账号</label>
                  <input value={user?.username || ''} readOnly disabled title="账号由管理员创建，不可修改" />
                  <span className="form-hint">账号由管理员创建，不可修改</span>
                </div>
                <div className="form-row">
                  <label>昵称</label>
                  <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} />
                </div>
                <div className="form-row">
                  <label>原密码（改密时填写）</label>
                  <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} autoComplete="current-password" />
                </div>
                <div className="form-row">
                  <label>新密码</label>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
                </div>
                {profileMsg && <div className="auth-error" style={{ color: 'var(--gold)' }}>{profileMsg}</div>}
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleSaveProfile}>
                  保存资料
                </button>

                <div className="room-list-section" style={{ marginTop: 24 }}>
                  <div className="room-list-title">我的对局</div>
                  {records.length === 0 ? (
                    <div className="room-list-empty">暂无记录</div>
                  ) : (
                    records.map((s) => (
                      <div
                        key={s.id}
                        className="room-card"
                        onClick={() => navigate(`/records/${s.id}`)}
                      >
                        <div className="room-card-header">
                          <span className="room-card-name">{s.room_name}</span>
                          <span className="room-card-code">{s.room_code}</span>
                        </div>
                        <div className="room-card-info">
                          <span>{formatTime(s.started_at)}</span>
                          <span>{s.end_reason || '进行中'}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {showCreate && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
            <div className="modal-content">
              <div className="modal-title">创建房间</div>
              <div className="form-row">
                <label>房间名称</label>
                <input type="text" value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="输入房间名称" maxLength={20} />
              </div>
              <div className="form-row">
                <label>对局时长</label>
                <select value={createDuration} onChange={(e) => setCreateDuration(Number(e.target.value))}>
                  {DURATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label>最少代入分</label>
                <input type="number" value={createMinBuyIn} onChange={(e) => setCreateMinBuyIn(Number(e.target.value))} min={50} max={5000} step={50} />
              </div>
              <div className="modal-actions">
                <button className="btn btn-primary" onClick={handleCreate}>确认创建</button>
                <button className="btn" onClick={() => setShowCreate(false)}>取消</button>
              </div>
            </div>
          </div>
        )}

        {showJoin && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowJoin(false); }}>
            <div className="modal-content">
              <div className="modal-title">加入房间</div>
              <div className="form-row">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="3位房间号"
                  maxLength={3}
                  style={{ textAlign: 'center', fontSize: '24px', letterSpacing: '8px' }}
                />
              </div>
              <div className="auth-error">{joinError}</div>
              <div className="modal-actions">
                <button className="btn btn-primary" onClick={handleJoin}>确认加入</button>
                <button className="btn" onClick={() => setShowJoin(false)}>取消</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
