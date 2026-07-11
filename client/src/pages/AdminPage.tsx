import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useApi, apiUpload } from '@/hooks/useApi';

type Tab = 'users' | 'records';

export default function AdminPage() {
  const navigate = useNavigate();
  const api = useApi();
  const { user, token, clear } = useAuthStore();
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [msg, setMsg] = useState('');

  const [form, setForm] = useState({ username: '', nickname: '', password: '' });
  const [editUser, setEditUser] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ username: '', nickname: '', password: '', disabled: false });

  useEffect(() => {
    if (user && user.role !== 'admin') navigate('/lobby', { replace: true });
  }, [user, navigate]);

  const loadUsers = useCallback(async () => {
    const r = await api('/api/admin/users');
    if (r.ok) setUsers(r.users || []);
  }, [api]);

  const loadRecords = useCallback(async () => {
    const r = await api('/api/admin/records');
    if (r.ok) setSessions(r.sessions || []);
  }, [api]);

  useEffect(() => {
    if (tab === 'users') loadUsers();
    else loadRecords();
  }, [tab, loadUsers, loadRecords]);

  const handleLogout = () => {
    clear();
    navigate('/login', { replace: true });
  };

  const handleCreate = async () => {
    setMsg('');
    const r = await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    if (r.ok) {
      setForm({ username: '', nickname: '', password: '' });
      setMsg('已创建');
      loadUsers();
    } else {
      setMsg(r.msg || '创建失败');
    }
  };

  const openEdit = (u: any) => {
    setEditUser(u);
    setEditForm({
      username: u.username,
      nickname: u.nickname,
      password: '',
      disabled: !!u.disabled,
    });
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
    const nextUsername = editForm.username.trim();
    if (!/^[a-zA-Z0-9_]{2,20}$/.test(nextUsername)) {
      alert('账号仅限 2–20 位字母数字下划线');
      return;
    }
    const body: any = {
      nickname: editForm.nickname,
      disabled: editForm.disabled,
      newUsername: nextUsername,
    };
    if (editForm.password) body.password = editForm.password;
    const r = await api(`/api/admin/users/${encodeURIComponent(editUser.username)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    if (r.ok) {
      setEditUser(null);
      loadUsers();
    } else {
      alert(r.msg || '保存失败');
    }
  };

  const handleDelete = async (username: string) => {
    if (!confirm(`确定删除账号 ${username}？`)) return;
    const r = await api(`/api/admin/users/${username}`, { method: 'DELETE' });
    if (r.ok) loadUsers();
    else alert(r.msg || '删除失败');
  };

  const handleAvatar = async (username: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    const fd = new FormData();
    fd.append('avatar', file);
    const r = await apiUpload(`/api/admin/users/${username}/avatar`, fd, token);
    if (r.ok) loadUsers();
    else alert(r.msg || '上传失败');
  };

  const formatTime = (ts: number) => {
    if (!ts) return '-';
    const d = new Date(ts * 1000);
    return d.toLocaleString();
  };

  return (
    <div className="auth-body">
      <div className="auth-wrap admin-wrap">
        <div className="lobby-card lobby-v2 admin-card">
          <div className="lobby-header">
            <div>
              <div className="auth-logo" style={{ fontSize: 22 }}>管理端</div>
              <div className="lobby-overview">扯开 · 账号与对局</div>
            </div>
            <div className="lobby-user">
              <span>{user?.nickname}</span>
              <button className="btn btn-small" onClick={handleLogout}>退出</button>
            </div>
          </div>

          <div className="lobby-tabs">
            <button className={`lobby-tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>
              账号管理
            </button>
            <button className={`lobby-tab ${tab === 'records' ? 'active' : ''}`} onClick={() => setTab('records')}>
              对局记录
            </button>
          </div>

          <div className="lobby-body">
            {tab === 'users' && (
              <>
                <div className="admin-create">
                  <div className="room-list-title">新建游戏账号</div>
                  <div className="form-row">
                    <label>账号</label>
                    <input
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      placeholder="字母数字下划线"
                    />
                  </div>
                  <div className="form-row">
                    <label>昵称</label>
                    <input
                      value={form.nickname}
                      onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                      placeholder="显示名"
                    />
                  </div>
                  <div className="form-row">
                    <label>密码</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                    />
                  </div>
                  {msg && <div className="auth-error" style={{ color: 'var(--gold)' }}>{msg}</div>}
                  <button className="btn btn-primary" onClick={handleCreate}>创建</button>
                </div>

                <div className="room-list-section" style={{ marginTop: 20 }}>
                  <div className="room-list-title">全部账号</div>
                  <div className="admin-user-list">
                    {users.map((u) => (
                      <div key={u.username} className="admin-user-row">
                        <div className="admin-user-main">
                          {u.avatar_path ? (
                            <img className="avatar" src={u.avatar_path} alt="" />
                          ) : (
                            <div className="avatar-placeholder">{u.nickname?.[0]}</div>
                          )}
                          <div>
                            <div className="friend-name">
                              {u.nickname}
                              {u.role === 'admin' && <span className="tag-admin">管理</span>}
                              {u.disabled ? <span className="tag-disabled">已禁用</span> : null}
                            </div>
                            <div className="friend-user">@{u.username}</div>
                          </div>
                        </div>
                        <div className="admin-user-actions">
                          <label className="btn btn-small" style={{ cursor: 'pointer' }}>
                            头像
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={(e) => handleAvatar(u.username, e)}
                            />
                          </label>
                          <button className="btn btn-small" onClick={() => openEdit(u)}>编辑</button>
                          {u.username !== 'admin' && (
                            <button className="btn btn-small btn-danger" onClick={() => handleDelete(u.username)}>
                              删除
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {tab === 'records' && (
              <div className="room-list">
                {sessions.length === 0 ? (
                  <div className="room-list-empty">暂无对局记录</div>
                ) : (
                  sessions.map((s) => (
                    <div
                      key={s.id}
                      className="room-card"
                      onClick={() => navigate(`/admin/records/${s.id}`)}
                    >
                      <div className="room-card-header">
                        <span className="room-card-name">{s.room_name}</span>
                        <span className="room-card-code">房号 {s.room_code}</span>
                      </div>
                      <div className="room-card-info">
                        <span>{formatTime(s.started_at)}</span>
                        <span>房主 {s.host_username}</span>
                        <span>
                          {s.duration_minutes
                            ? `${s.duration_minutes} 分钟`
                            : s.round_limit
                              ? `${s.round_limit} 局上限（旧）`
                              : '—'}
                        </span>
                        <span>{s.end_reason || '未结束'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {editUser && (
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditUser(null); }}>
            <div className="modal-content">
              <div className="modal-title">编辑账号</div>
              <div className="form-row">
                <label>账号</label>
                <input
                  value={editForm.username}
                  onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                  disabled={editUser.username === 'admin'}
                  placeholder="字母数字下划线，2–20 位"
                />
              </div>
              <div className="form-row">
                <label>昵称</label>
                <input
                  value={editForm.nickname}
                  onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
                />
              </div>
              <div className="form-row">
                <label>新密码（留空不改）</label>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                />
              </div>
              <label className="admin-check">
                <input
                  type="checkbox"
                  checked={editForm.disabled}
                  onChange={(e) => setEditForm({ ...editForm, disabled: e.target.checked })}
                />
                禁用账号
              </label>
              <div className="modal-actions">
                <button className="btn btn-primary" onClick={handleSaveEdit}>保存</button>
                <button className="btn" onClick={() => setEditUser(null)}>取消</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
