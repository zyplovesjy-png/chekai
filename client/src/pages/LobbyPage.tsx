import { useState, useEffect, useCallback, useRef, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useApi, apiUpload } from '@/hooks/useApi';
import { usePresence } from '@/hooks/usePresence';
import { DURATION_OPTIONS } from '@/stores/roomStore';
import { getAvatarInitial } from '@/utils/avatar';
import {
  startGameAssetPreload,
  pauseGameAssetPreload,
  subscribeGameAssetPreload,
  type GameAssetPreloadState,
} from '@/utils/gameAssetPreload';

type Tab = 'rooms' | 'friends' | 'rank' | 'me';

function Avatar({ path, name, size = 36 }: { path?: string | null; name?: string; size?: number }) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  const fixedSize = {
    width: size,
    height: size,
    minWidth: size,
    maxWidth: size,
    minHeight: size,
    maxHeight: size,
  };
  if (path && failedPath !== path) {
    return (
      <img
        className="avatar"
        src={path}
        alt=""
        style={fixedSize}
        onError={() => setFailedPath(path)}
      />
    );
  }
  return (
    <div
      className="avatar-placeholder"
      style={{ ...fixedSize, fontSize: size * 0.4 }}
    >
      {getAvatarInitial(name)}
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
  const [rankRows, setRankRows] = useState<any[]>([]);
  const [rankLoading, setRankLoading] = useState(false);
  const rankReqId = useRef(0);
  const [records, setRecords] = useState<any[]>([]);
  const [myStats, setMyStats] = useState<{ total_profit?: number; total_games?: number; wins?: number; losses?: number; ties?: number } | null>(null);
  const [overview, setOverview] = useState({ onlineCount: 0, roomCount: 0 });

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDuration, setCreateDuration] = useState(120);
  const [createMinBuyIn, setCreateMinBuyIn] = useState(100);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');

  const [nickname, setNickname] = useState(user?.nickname || '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileMsg, setProfileMsg] = useState('');
  const [assetPreload, setAssetPreload] = useState<GameAssetPreloadState>(() => ({
    progress: 0,
    ready: false,
    loading: false,
  }));

  usePresence((data) => {
    setOverview({ onlineCount: data.onlineCount, roomCount: data.roomCount });
    if (data.rooms) setRooms(data.rooms);
  });

  useEffect(() => {
    const unsub = subscribeGameAssetPreload(setAssetPreload);
    startGameAssetPreload();
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') navigate('/admin', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    setNickname(user?.nickname || '');
  }, [user?.nickname]);

  const loadRooms = useCallback(async () => {
    const r = await api('/api/rooms/list');
    if (r.ok) setRooms(r.rooms || []);
  }, [api]);

  const loadFriends = useCallback(async () => {
    const r = await api('/api/friends');
    if (r.ok) setFriends(r.friends || []);
  }, [api]);

  const loadRank = useCallback(async () => {
    const reqId = ++rankReqId.current;
    setRankLoading(true);
    const r = await api('/api/leaderboard?type=winrate');
    if (reqId !== rankReqId.current) return;
    setRankLoading(false);
    if (r.ok) setRankRows(r.rows || []);
  }, [api]);

  const loadRecords = useCallback(async () => {
    const r = await api('/api/records?limit=100');
    if (r.ok) setRecords(r.sessions || []);
  }, [api]);

  const loadMyStats = useCallback(async () => {
    if (!user?.username) return;
    const r = await api(`/api/stats/${user.username}`);
    if (r.ok) setMyStats(r.stats || null);
  }, [api, user?.username]);

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
    if (tab === 'me') {
      loadRecords();
      loadMyStats();
    }
  }, [tab, loadFriends, loadRecords, loadMyStats]);

  useEffect(() => {
    if (tab !== 'rank') return;
    setRankRows([]);
    loadRank();
  }, [tab, loadRank]);

  const handleLogout = () => {
    try {
      clear();
    } finally {
      window.location.replace('/login');
    }
  };

  const openProfile = () => {
    setNickname(user?.nickname || '');
    setOldPassword('');
    setNewPassword('');
    setProfileMsg('');
    setShowProfile(true);
  };

  const handleDisbandRoom = async (code: string, e: MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`确定销毁房间 ${code}？`)) return;
    const r = await api(`/api/rooms/${code}/disband`, { method: 'POST' });
    if (!r?.ok) {
      alert(r?.msg || '销毁失败');
      return;
    }
    loadRooms();
    loadOverview();
  };

  const goToRoom = (code: string) => {
    pauseGameAssetPreload();
    navigate(`/room/${code}`);
  };

  const handleCreate = async () => {
    const r = await api('/api/rooms/create', {
      method: 'POST',
      body: JSON.stringify({ name: createName, durationMinutes: createDuration, minBuyIn: createMinBuyIn }),
    });
    if (r.ok) goToRoom(r.room.code);
    else alert(r.msg || '创建失败');
  };

  const enterRoom = async (code: string) => {
    const r = await api('/api/rooms/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    if (r.ok || r.msg === '你已在该房间内') {
      goToRoom(code);
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
    if (r.ok) goToRoom(r.room.code);
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

  const myProfit = Number(myStats?.total_profit) || 0;
  const profitTone = myProfit > 0 ? 'up' : myProfit < 0 ? 'down' : 'flat';

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
              <button type="button" className="lobby-avatar-btn" onClick={openProfile} title="修改资料">
                <Avatar path={user?.avatar_path} name={user?.nickname} />
              </button>
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
                <div className="lobby-asset-preload" aria-live="polite">
                  {assetPreload.ready ? (
                    <div className="lobby-asset-ready">资源已就绪</div>
                  ) : (
                    <>
                      <div className="lobby-asset-label">静态资源加载中</div>
                      <div className="lobby-asset-track">
                        <div
                          className="lobby-asset-fill"
                          style={{ width: `${Math.round(assetPreload.progress * 100)}%` }}
                        />
                      </div>
                    </>
                  )}
                </div>
                <div className="room-list-section">
                  <div className="room-list-title">房间列表</div>
                  <div className="room-list">
                    {rooms.length === 0 ? (
                      <div className="room-list-empty">暂无房间，点击上方创建</div>
                    ) : (
                      rooms.map((room) => {
                        const canDisband = !!room.canDisband;
                        return (
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
                            {canDisband && (
                              <button
                                type="button"
                                className="btn btn-small room-card-disband"
                                onClick={(e) => handleDisbandRoom(room.code, e)}
                              >
                                销毁房间
                              </button>
                            )}
                          </div>
                        );
                      })
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
                <div className="room-list-title" style={{ marginBottom: 12 }}>胜率排行榜</div>
                <div className="rank-list rank-list--winrate">
                  {rankLoading && rankRows.length === 0 ? (
                    <div className="room-list-empty">加载中…</div>
                  ) : rankRows.length === 0 ? (
                    <div className="room-list-empty">暂无排行数据</div>
                  ) : (
                    rankRows.map((row, i) => {
                      const pos = i + 1;
                      const wins = Number(row.wins) || 0;
                      const losses = Number(row.losses) || 0;
                      const hands = Number(row.total_hands) || 0;
                      const winratePct = Math.round((Number(row.winrate) || 0) * 100);
                      const metricTone = winratePct >= 50 ? 'up' : winratePct > 0 ? 'flat' : 'down';

                      return (
                        <div
                          key={row.username}
                          className={`rank-row rank-row--data${pos <= 3 ? ` is-top-${pos}` : ''}`}
                        >
                          <div className="rank-row-main">
                            <span className="rank-pos">{String(pos).padStart(2, '0')}</span>
                            <div className={`rank-metric tone-${metricTone}`}>
                              <span className="rank-metric-value">
                                {winratePct}
                                <span className="rank-metric-pct">%</span>
                              </span>
                              <span className="rank-metric-unit">{hands} 局样本</span>
                            </div>
                          </div>
                          <div className="rank-row-who">
                            <Avatar path={row.avatar_path} name={row.nickname} size={28} />
                            <div className="rank-who-meta">
                              <div className="rank-who-name">{row.nickname}</div>
                              <div className="rank-who-sub">{wins}胜 {losses}负</div>
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
              <div className="me-panel">
                <div className={`me-profit-card tone-${profitTone}`}>
                  <div className="me-profit-label">总积分</div>
                  <div className="me-profit-value">
                    {myProfit > 0 ? '+' : ''}{myProfit}
                  </div>
                  <div className="me-profit-sub">
                    累计 {Number(myStats?.total_games) || 0} 局
                    {myStats ? ` · ${Number(myStats.wins) || 0}胜 ${Number(myStats.losses) || 0}负` : ''}
                  </div>
                </div>

                <div className="room-list-section" style={{ marginTop: 20 }}>
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

          <footer className="site-icp-footer">
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
            >
              蜀ICP备2026039234号-1
            </a>
          </footer>
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

        {showProfile && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowProfile(false); }}>
            <div className="modal-content profile-modal">
              <div className="modal-title">个人资料</div>
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
              <div className="modal-actions">
                <button className="btn btn-primary" onClick={handleSaveProfile}>保存资料</button>
                <button className="btn" onClick={() => setShowProfile(false)}>关闭</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
