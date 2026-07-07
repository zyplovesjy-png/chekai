import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useApi } from '@/hooks/useApi';
import { apiUpload } from '@/hooks/useApi';

export default function LobbyPage() {
  const navigate = useNavigate();
  const api = useApi();
  const { user, token, clear } = useAuthStore();
  const [rooms, setRooms] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createRounds, setCreateRounds] = useState(16);
  const [createMinBuyIn, setCreateMinBuyIn] = useState(100);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [showProfile, setShowProfile] = useState(false);

  const loadRooms = useCallback(async () => {
    const r = await api('/api/rooms/my');
    if (r.ok) setRooms(r.rooms || []);
  }, [api]);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  const handleLogout = () => {
    clear();
    navigate('/login', { replace: true });
  };

  const handleCreate = async () => {
    const r = await api('/api/rooms/create', {
      method: 'POST',
      body: JSON.stringify({ name: createName, roundLimit: createRounds, minBuyIn: createMinBuyIn }),
    });
    if (r.ok) {
      navigate(`/room/${r.room.code}`);
    } else {
      alert(r.msg || '创建失败');
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
    if (r.ok) {
      navigate(`/room/${r.room.code}`);
    } else {
      setJoinError(r.msg || '加入失败');
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    const formData = new FormData();
    formData.append('avatar', file);
    const r = await apiUpload('/api/user/avatar', formData, token);
    if (r.ok) {
      // 刷新页面以更新头像
      window.location.reload();
    }
  };

  return (
    <div className="auth-body">
      <div className="auth-wrap">
        <div className="lobby-card">
          <div className="lobby-header">
            <div className="auth-logo">扯 旋</div>
            <div className="lobby-user">
              <div style={{ cursor: 'pointer' }} onClick={() => setShowProfile(true)}>
                {user?.avatar_path ? (
                  <img className="avatar" src={user.avatar_path} alt="" />
                ) : (
                  <div className="avatar-placeholder">{user?.nickname?.[0] || '?'}</div>
                )}
              </div>
              <span>{user?.nickname || '玩家'}</span>
              <button className="btn btn-small" onClick={handleLogout}>退出</button>
            </div>
          </div>

          <div className="lobby-body">
            <div className="lobby-actions">
              <button className="btn btn-primary" onClick={() => setShowCreate(true)}>创建房间</button>
              <button className="btn" onClick={() => setShowJoin(true)}>加入房间</button>
            </div>

            <div className="room-list-section">
              <div className="room-list-title">我的房间</div>
              <div className="room-list">
                {rooms.length === 0 ? (
                  <div className="room-list-empty">暂无房间，点击上方创建</div>
                ) : (
                  rooms.map((room) => (
                    <div
                      key={room.code}
                      className="room-card"
                      onClick={() => navigate(`/room/${room.code}`)}
                    >
                      <div className="room-card-header">
                        <span className="room-card-name">{room.name}</span>
                        <span className="room-card-code">房号 {room.code}</span>
                      </div>
                      <div className="room-card-info">
                        <span>{room.gameStarted ? '游戏中' : '等待中'} · 第{room.gameRound}局/{room.roundLimit}局</span>
                        <span>{room.memberCount}人 · {room.seatedCount}人已入座</span>
                        <span>最少代入 {room.minBuyIn}分</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 创建房间弹窗 */}
        {showCreate && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
            <div className="modal-content">
              <div className="modal-title">创建房间</div>
              <div className="form-row">
                <label>房间名称</label>
                <input type="text" value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="输入房间名称" maxLength={20} />
              </div>
              <div className="form-row">
                <label>对局数</label>
                <select value={createRounds} onChange={(e) => setCreateRounds(Number(e.target.value))}>
                  <option value={8}>8 局</option>
                  <option value={16}>16 局</option>
                  <option value={32}>32 局</option>
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

        {/* 加入房间弹窗 */}
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

        {/* 个人资料弹窗 */}
        {showProfile && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowProfile(false); }}>
            <div className="modal-content">
              <div className="modal-title">个人资料</div>
              <div className="avatar-upload">
                {user?.avatar_path ? (
                  <img className="avatar-preview" src={user.avatar_path} alt="" />
                ) : (
                  <div className="avatar-preview placeholder">{user?.nickname?.[0] || '?'}</div>
                )}
              </div>
              <p style={{ color: 'var(--gold)', fontWeight: 600, marginBottom: '4px' }}>{user?.nickname}</p>
              <p style={{ color: 'var(--text-dim)', fontSize: '12px', marginBottom: '16px' }}>@{user?.username}</p>
              <label className="btn btn-primary" style={{ display: 'inline-block', cursor: 'pointer' }}>
                更换头像
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
              </label>
              <div style={{ marginTop: '12px' }}>
                <button className="btn" onClick={() => setShowProfile(false)}>关闭</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
