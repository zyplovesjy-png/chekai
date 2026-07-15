import { useState, useEffect, useCallback, type MouseEvent, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useApi, apiUpload } from '@/hooks/useApi';
import type { QuickMessage } from '@/types/quickMessages';
import { getAvatarInitial } from '@/utils/avatar';

type Tab = 'users' | 'records' | 'messages';

function AdminUserAvatar({ path, name }: { path?: string | null; name?: string | null }) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  if (path && failedPath !== path) {
    return (
      <img
        className="avatar admin-user-avatar"
        src={path}
        alt=""
        onError={() => setFailedPath(path)}
      />
    );
  }
  return <div className="avatar-placeholder admin-user-avatar">{getAvatarInitial(name)}</div>;
}

export default function AdminPage() {
  const navigate = useNavigate();
  const api = useApi();
  const { user, token, clear } = useAuthStore();
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [quickMessages, setQuickMessages] = useState<QuickMessage[]>([]);
  const [quickMessageStatus, setQuickMessageStatus] = useState('');
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

  const loadQuickMessages = useCallback(async () => {
    const r = await api('/api/quick-messages');
    if (r.ok) setQuickMessages(r.messages || []);
  }, [api]);

  useEffect(() => {
    if (tab === 'users') loadUsers();
    else if (tab === 'records') loadRecords();
    else loadQuickMessages();
  }, [tab, loadUsers, loadRecords, loadQuickMessages]);

  const updateQuickMessage = (id: number, content: string) => {
    const next = Array.from(content).slice(0, 40).join('');
    setQuickMessages((current) => current.map((item) => (
      item.id === id ? { ...item, content: next } : item
    )));
    setQuickMessageStatus('');
  };

  const moveQuickMessage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= quickMessages.length) return;
    setQuickMessages((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next.map((item, sortOrder) => ({ ...item, sortOrder }));
    });
    setQuickMessageStatus('');
  };

  const addQuickMessage = () => {
    if (quickMessages.length >= 50) {
      setQuickMessageStatus('最多配置 50 条');
      return;
    }
    setQuickMessages((current) => [
      ...current,
      { id: -Date.now(), content: '', sortOrder: current.length },
    ]);
    setQuickMessageStatus('');
  };

  const saveQuickMessages = async () => {
    const messages = quickMessages.map((item) => item.content.trim());
    if (messages.some((content) => !content)) {
      setQuickMessageStatus('消息内容不能为空');
      return;
    }
    if (messages.some((content) => Array.from(content).length > 40)) {
      setQuickMessageStatus('每条消息最多 40 个字符');
      return;
    }
    const r = await api('/api/admin/quick-messages', {
      method: 'PUT',
      body: JSON.stringify({ messages }),
    });
    if (r.ok) {
      setQuickMessages(r.messages || []);
      setQuickMessageStatus('已保存并实时同步到所有房间');
    } else {
      setQuickMessageStatus(r.msg || '保存失败');
    }
  };

  const handleLogout = () => {
    try {
      clear();
    } finally {
      window.location.replace('/login');
    }
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

  const handleResetWinrate = async () => {
    if (!confirm('确定清空胜率排行榜？将清零所有玩家的胜/负/平与手数，净输赢保留。')) return;
    if (!confirm('再次确认：此操作不可撤销。')) return;
    setMsg('');
    const r = await api('/api/admin/stats/reset-winrate', { method: 'POST' });
    if (r.ok) setMsg('胜率排行榜已清空');
    else setMsg(r.msg || '清空失败');
  };

  const handleResetProfit = async () => {
    if (!confirm('确定清空所有玩家的净输赢数据？胜率样本保留。')) return;
    if (!confirm('再次确认：此操作不可撤销。')) return;
    setMsg('');
    const r = await api('/api/admin/stats/reset-profit', { method: 'POST' });
    if (r.ok) setMsg('净输赢数据已清空');
    else setMsg(r.msg || '清空失败');
  };

  const handleClearAllRecords = async () => {
    if (!confirm('确定删除全部对局记录？不影响排行累计。')) return;
    if (!confirm('再次确认：此操作不可撤销。')) return;
    setMsg('');
    const r = await api('/api/admin/records/clear', { method: 'POST' });
    if (r.ok) {
      setMsg('对局记录已全部删除');
      loadRecords();
    } else setMsg(r.msg || '删除失败');
  };

  const handleDeleteRecord = async (id: number, e: MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`确定删除对局记录 #${id}？`)) return;
    const r = await api(`/api/admin/records/${id}`, { method: 'DELETE' });
    if (r.ok) loadRecords();
    else alert(r.msg || '删除失败');
  };

  const handleAvatar = async (username: string, e: ChangeEvent<HTMLInputElement>) => {
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
            <button className={`lobby-tab ${tab === 'messages' ? 'active' : ''}`} onClick={() => setTab('messages')}>
              快捷消息
            </button>
          </div>

          <div className="lobby-body">
            {tab === 'users' && (
              <>
                <div className="admin-create">
                  <div className="room-list-title">数据清理</div>
                  <button className="btn btn-danger" type="button" onClick={handleResetWinrate} style={{ width: '100%' }}>
                    清空胜率排行榜
                  </button>
                  <p className="admin-hint">清零胜/负/平与手数，不影响净输赢。</p>
                  <button className="btn btn-danger" type="button" onClick={handleResetProfit} style={{ width: '100%', marginTop: 12 }}>
                    清空净输赢数据
                  </button>
                  <p className="admin-hint">将所有玩家净输赢归零，不影响胜率排行。</p>
                </div>
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
                          <AdminUserAvatar path={u.avatar_path} name={u.nickname} />
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
                <div className="admin-records-toolbar">
                  <button className="btn btn-danger btn-small" type="button" onClick={handleClearAllRecords}>
                    清空全部对局记录
                  </button>
                </div>
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
                      <button
                        type="button"
                        className="btn btn-small btn-danger room-card-disband"
                        onClick={(e) => handleDeleteRecord(s.id, e)}
                      >
                        删除记录
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === 'messages' && (
              <section className="admin-quick-messages">
                <div className="admin-quick-message-intro">
                  <div>
                    <div className="room-list-title">房间快捷消息</div>
                    <p className="admin-hint">按当前顺序展示。最多 50 条，每条最多 40 个字符。</p>
                  </div>
                  <span>{quickMessages.length}/50</span>
                </div>

                <div className="admin-quick-message-list">
                  {quickMessages.map((message, index) => (
                    <div className="admin-quick-message-row" key={message.id}>
                      <span className="admin-quick-message-order">{index + 1}</span>
                      <div className="admin-quick-message-field">
                        <input
                          value={message.content}
                          maxLength={80}
                          aria-label={`第 ${index + 1} 条快捷消息`}
                          onChange={(event) => updateQuickMessage(message.id, event.target.value)}
                        />
                        <span>{Array.from(message.content).length}/40</span>
                      </div>
                      <div className="admin-quick-message-actions">
                        <button
                          type="button"
                          className="btn btn-small"
                          aria-label="上移"
                          disabled={index === 0}
                          onClick={() => moveQuickMessage(index, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="btn btn-small"
                          aria-label="下移"
                          disabled={index === quickMessages.length - 1}
                          onClick={() => moveQuickMessage(index, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="btn btn-small btn-danger"
                          onClick={() => {
                            setQuickMessages((current) => current
                              .filter((item) => item.id !== message.id)
                              .map((item, sortOrder) => ({ ...item, sortOrder })));
                            setQuickMessageStatus('');
                          }}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                  {quickMessages.length === 0 && (
                    <div className="room-list-empty">暂无快捷消息，可点击下方按钮添加</div>
                  )}
                </div>

                {quickMessageStatus && (
                  <div className="admin-quick-message-status" role="status">{quickMessageStatus}</div>
                )}
                <div className="admin-quick-message-footer">
                  <button type="button" className="btn" onClick={addQuickMessage} disabled={quickMessages.length >= 50}>
                    新增消息
                  </button>
                  <button type="button" className="btn btn-primary" onClick={saveQuickMessages}>
                    统一保存
                  </button>
                </div>
              </section>
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
