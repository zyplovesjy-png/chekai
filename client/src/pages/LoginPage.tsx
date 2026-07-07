import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useApi } from '@/hooks/useApi';

export default function LoginPage() {
  const navigate = useNavigate();
  const api = useApi();
  const { token, setAuth } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) navigate('/lobby', { replace: true });
  }, [token, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const r = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    setLoading(false);
    if (r.ok) {
      setAuth(r.token, r.user);
      navigate('/lobby', { replace: true });
    } else {
      setError(r.msg || '登录失败');
    }
  };

  return (
    <div className="auth-body">
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-logo">扯 开</div>
          <div className="auth-sub">永无定张 你晓得三</div>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <label>账号</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入账号"
                autoComplete="username"
                required
              />
            </div>
            <div className="form-row">
              <label>密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                autoComplete="current-password"
                required
              />
            </div>
            <div className="auth-error">{error}</div>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', fontSize: '15px', marginTop: '4px' }}
              disabled={loading}
            >
              {loading ? '登录中...' : '登 录'}
            </button>
          </form>
          <div className="auth-hint">账号由管理员分配，无注册入口。</div>
        </div>
      </div>
    </div>
  );
}
