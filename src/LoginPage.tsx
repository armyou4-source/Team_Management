import { useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { signInWithEmail } from './authService';

interface LoginPageProps {
  onSuccess: (session?: Session | null) => Promise<void>;
  initialError?: string | null;
}

export default function LoginPage({ onSuccess, initialError = null }: LoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { session } = await signInWithEmail(email.trim(), password);
      await onSuccess(session);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '로그인에 실패했습니다.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background:
            radial-gradient(circle at top right, rgba(99, 102, 241, 0.12), transparent 40%),
            var(--bg-primary);
        }

        .login-card {
          width: 100%;
          max-width: 420px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          padding: 32px;
        }

        .login-logo {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 22px;
          margin-bottom: 16px;
        }

        .login-title {
          font-family: 'Outfit', sans-serif;
          font-size: 24px;
          font-weight: 700;
          margin: 0 0 8px;
          color: var(--text-primary);
        }

        .login-subtitle {
          margin: 0 0 28px;
          color: var(--text-secondary);
          font-size: 14px;
          line-height: 1.6;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .login-label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 6px;
        }

        .login-input {
          width: 100%;
          padding: 12px 14px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 14px;
        }

        .login-input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-light);
        }

        .login-error {
          padding: 12px 14px;
          border-radius: var(--radius-sm);
          background: #fef2f2;
          color: #b91c1c;
          font-size: 13px;
          line-height: 1.5;
        }

        .login-button {
          margin-top: 8px;
          padding: 12px 16px;
          border: none;
          border-radius: var(--radius-sm);
          background: var(--accent);
          color: white;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }

        .login-button:hover:not(:disabled) {
          background: var(--accent-hover);
        }

        .login-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .login-note {
          margin-top: 20px;
          font-size: 12px;
          color: var(--text-tertiary);
          line-height: 1.6;
        }
      `}</style>

      <div className="login-card">
        <div className="login-logo">M</div>
        <h1 className="login-title">면담 관리 대시보드</h1>
        <p className="login-subtitle">
          팀장 계정으로 로그인하면 본인 소속 및 하위 파트 구성원의 면담 기록을 관리할 수 있습니다.
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div>
            <label className="login-label" htmlFor="email">
              이메일
            </label>
            <input
              id="email"
              type="email"
              className="login-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="login-label" htmlFor="password">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              className="login-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호"
              autoComplete="current-password"
              required
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <p className="login-note">
          접근 권한은 Supabase RLS 정책에 따라 팀장 직위 사용자에게만 허용됩니다.
        </p>
      </div>
    </div>
  );
}
