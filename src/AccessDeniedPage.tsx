import { useState } from 'react';
import type {
  AuthUserInfo,
  PermissionCheckResult,
  TeamMemberProfile,
} from './authService';
import { signOut } from './authService';
import { formatEmployeeId } from './teamMemberService';

interface AccessDeniedPageProps {
  profile: TeamMemberProfile | null;
  authUser: AuthUserInfo | null;
  permissionCheck: PermissionCheckResult | null;
  message?: string | null;
  onRetry: () => Promise<void>;
  onLogout: () => Promise<void>;
}

export default function AccessDeniedPage({
  profile,
  authUser,
  permissionCheck,
  message,
  onRetry,
  onLogout,
}: AccessDeniedPageProps) {
  const [retrying, setRetrying] = useState(false);

  const handleLogout = async () => {
    await signOut();
    await onLogout();
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="permission-page">
      <style>{`
        .permission-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background:
            radial-gradient(circle at top left, rgba(239, 68, 68, 0.08), transparent 35%),
            var(--bg-primary);
        }

        .permission-card {
          width: 100%;
          max-width: 560px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          padding: 32px;
        }

        .permission-header {
          text-align: center;
          margin-bottom: 28px;
        }

        .permission-icon {
          font-size: 42px;
          margin-bottom: 12px;
        }

        .permission-title {
          font-family: 'Outfit', sans-serif;
          font-size: 24px;
          font-weight: 700;
          margin: 0 0 8px;
          color: var(--text-primary);
        }

        .permission-subtitle {
          margin: 0;
          color: var(--text-secondary);
          font-size: 14px;
          line-height: 1.6;
        }

        .permission-summary {
          padding: 14px 16px;
          border-radius: var(--radius-sm);
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #991b1b;
          font-size: 13px;
          line-height: 1.6;
          margin-bottom: 20px;
        }

        .permission-section-title {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin: 0 0 12px;
        }

        .check-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 20px;
        }

        .check-item {
          display: flex;
          gap: 12px;
          padding: 14px 16px;
          border-radius: var(--radius-md);
          border: 1px solid var(--border-color);
          background: var(--bg-primary);
        }

        .check-item.passed {
          border-color: #a7f3d0;
          background: #ecfdf5;
        }

        .check-item.failed {
          border-color: #fecaca;
          background: #fffafa;
        }

        .check-status {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 700;
          flex-shrink: 0;
        }

        .check-item.passed .check-status {
          background: #10b981;
          color: white;
        }

        .check-item.failed .check-status {
          background: #ef4444;
          color: white;
        }

        .check-content {
          flex: 1;
          min-width: 0;
        }

        .check-label {
          display: block;
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .check-detail {
          display: block;
          font-size: 12px;
          color: var(--text-secondary);
          line-height: 1.5;
          word-break: break-all;
        }

        .info-panel {
          padding: 16px;
          border-radius: var(--radius-md);
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          margin-bottom: 24px;
        }

        .info-grid {
          display: grid;
          grid-template-columns: 110px 1fr;
          gap: 8px 12px;
          font-size: 12px;
        }

        .info-label {
          color: var(--text-tertiary);
          font-weight: 600;
        }

        .info-value {
          color: var(--text-primary);
          word-break: break-all;
        }

        .permission-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .permission-button {
          padding: 10px 16px;
          border-radius: var(--radius-sm);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          border: none;
        }

        .permission-button.primary {
          background: var(--accent);
          color: white;
        }

        .permission-button.secondary {
          background: var(--bg-secondary);
          color: var(--text-secondary);
          border: 1px solid var(--border-color);
        }

        .permission-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .permission-help {
          margin-top: 20px;
          font-size: 12px;
          color: var(--text-tertiary);
          line-height: 1.7;
        }
      `}</style>

      <div className="permission-card">
        <div className="permission-header">
          <div className="permission-icon">🔐</div>
          <h1 className="permission-title">권한 확인 결과</h1>
          <p className="permission-subtitle">
            로그인은 완료되었지만, 면담 대시보드 접근 조건을 충족하지 못했습니다.
          </p>
        </div>

        {(message || permissionCheck?.summary) && (
          <div className="permission-summary">
            {message || permissionCheck?.summary}
          </div>
        )}

        {permissionCheck && (
          <>
            <h2 className="permission-section-title">접근 조건 체크</h2>
            <div className="check-list">
              {permissionCheck.steps.map((step) => (
                <div
                  key={step.id}
                  className={`check-item ${step.passed ? 'passed' : 'failed'}`}
                >
                  <span className="check-status">{step.passed ? '✓' : '✕'}</span>
                  <div className="check-content">
                    <span className="check-label">{step.label}</span>
                    <span className="check-detail">{step.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <h2 className="permission-section-title">계정 / 프로필 정보</h2>
        <div className="info-panel">
          <div className="info-grid">
            <span className="info-label">Auth User ID</span>
            <span className="info-value">{authUser?.id ?? '-'}</span>
            <span className="info-label">로그인 이메일</span>
            <span className="info-value">{authUser?.email ?? '-'}</span>
            <span className="info-label">team_member</span>
            <span className="info-value">
              {profile
                ? `${profile.성명} (${formatEmployeeId(profile.사번, profile.구분)})`
                : '연결된 프로필 없음'}
            </span>
            <span className="info-label">직위 / 소속</span>
            <span className="info-value">
              {profile
                ? `${profile.직위 ?? '미등록'} · ${profile.소속}`
                : '-'}
            </span>
            <span className="info-label">auth_user_id</span>
            <span className="info-value">{profile?.auth_user_id ?? '-'}</span>
          </div>
        </div>

        <div className="permission-actions">
          <button
            type="button"
            className="permission-button primary"
            onClick={handleRetry}
            disabled={retrying}
          >
            {retrying ? '권한 다시 확인 중...' : '권한 다시 확인'}
          </button>
          <button
            type="button"
            className="permission-button secondary"
            onClick={handleLogout}
          >
            다른 계정으로 로그인
          </button>
        </div>

        <p className="permission-help">
          team_member에 로그인 UID를 연결하세요. 사번이 아니라 auth_user_id 컬럼에 넣어야 합니다.
          <br />
          <code>UPDATE team_member SET auth_user_id = &apos;auth.uid()&apos;::uuid WHERE 사번 = &apos;사번&apos;;</code>
        </p>
      </div>
    </div>
  );
}
