import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import {
  type AuthPhase,
  type AuthUserInfo,
  type PermissionCheckResult,
  type TeamMemberProfile,
  resolveAuthPhase,
  signOut,
} from './authService';
import AccessDeniedPage from './AccessDeniedPage';
import Dashboard from './Dashboard';
import DepartmentManagement from './DepartmentManagement';
import type { LeaderPage } from './LeaderPageNav';
import LoginPage from './LoginPage';
import './App.css';

const AUTH_SYNC_EVENTS: AuthChangeEvent[] = ['INITIAL_SESSION', 'SIGNED_IN'];

type SyncAuthOptions = {
  showLoading?: boolean;
  skipEnsureSession?: boolean;
};

export default function App() {
  const [authPhase, setAuthPhase] = useState<AuthPhase>('loading');
  const [currentUser, setCurrentUser] = useState<TeamMemberProfile | null>(null);
  const [authUser, setAuthUser] = useState<AuthUserInfo | null>(null);
  const [permissionCheck, setPermissionCheck] = useState<PermissionCheckResult | null>(null);
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<LeaderPage>('interview');
  const [loginReferenceDate, setLoginReferenceDate] = useState<Date | null>(null);

  const authPhaseRef = useRef<AuthPhase>('loading');
  const syncInFlightRef = useRef(false);
  const hasResolvedOnceRef = useRef(false);

  const applyAuthResult = useCallback(
    (result: Awaited<ReturnType<typeof resolveAuthPhase>>) => {
      setCurrentUser(result.profile);
      setAuthUser(result.authUser);
      setPermissionCheck(result.permissionCheck);
      setAuthErrorMessage(result.errorMessage ?? null);
      setAuthPhase(result.phase);
      authPhaseRef.current = result.phase;
      hasResolvedOnceRef.current = true;
      if (result.phase === 'ready') {
        setLoginReferenceDate((prev) => prev ?? new Date());
      }
    },
    []
  );

  const syncAuth = useCallback(
    async (sessionOverride?: Session | null, options: SyncAuthOptions = {}) => {
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;

      const showLoading =
        options.showLoading ?? (!hasResolvedOnceRef.current || authPhaseRef.current === 'unauthenticated');

      if (showLoading) {
        setAuthPhase('loading');
        authPhaseRef.current = 'loading';
      }

      try {
        const result = await resolveAuthPhase(sessionOverride, {
          skipEnsureSession: options.skipEnsureSession ?? !!sessionOverride,
        });
        applyAuthResult(result);
      } catch (err) {
        console.error('Auth sync failed:', err);
        setCurrentUser(null);
        setAuthUser(null);
        setPermissionCheck(null);
        setAuthErrorMessage(
          err instanceof Error ? err.message : '인증 확인 중 오류가 발생했습니다.'
        );
        setAuthPhase('unauthenticated');
        authPhaseRef.current = 'unauthenticated';
        hasResolvedOnceRef.current = true;
      } finally {
        syncInFlightRef.current = false;
      }
    },
    [applyAuthResult]
  );

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        hasResolvedOnceRef.current = false;
        setCurrentUser(null);
        setAuthUser(null);
        setPermissionCheck(null);
        setAuthErrorMessage(null);
        setAuthPhase('unauthenticated');
        authPhaseRef.current = 'unauthenticated';
        setLoginReferenceDate(null);
        return;
      }

      // TOKEN_REFRESHED 등은 무시 — setSession 루프로 깜빡임 발생 방지
      if (!AUTH_SYNC_EVENTS.includes(event)) return;

      window.setTimeout(() => {
        void syncAuth(session, {
          showLoading: !hasResolvedOnceRef.current,
          skipEnsureSession: true,
        });
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, [syncAuth]);

  const handleLogout = useCallback(async () => {
    await signOut();
    hasResolvedOnceRef.current = false;
    setCurrentUser(null);
    setAuthUser(null);
    setPermissionCheck(null);
    setAuthErrorMessage(null);
    setAuthPhase('unauthenticated');
    authPhaseRef.current = 'unauthenticated';
    setLoginReferenceDate(null);
  }, []);

  if (authPhase === 'loading') {
    return <div className="auth-loading-page">권한 확인 중...</div>;
  }

  if (authPhase === 'unauthenticated') {
    return (
      <LoginPage
        onSuccess={(session) =>
          syncAuth(session, { showLoading: true, skipEnsureSession: true })
        }
        initialError={authErrorMessage}
      />
    );
  }

  if (authPhase === 'unauthorized') {
    return (
      <AccessDeniedPage
        profile={currentUser}
        authUser={authUser}
        permissionCheck={permissionCheck}
        message={authErrorMessage}
        onRetry={() => syncAuth(undefined, { showLoading: true })}
        onLogout={handleLogout}
      />
    );
  }

  if (!currentUser) {
    return (
      <AccessDeniedPage
        profile={null}
        authUser={authUser}
        permissionCheck={permissionCheck}
        message={authErrorMessage}
        onRetry={() => syncAuth(undefined, { showLoading: true })}
        onLogout={handleLogout}
      />
    );
  }

  return activePage === 'department' ? (
    <DepartmentManagement
      currentUser={currentUser}
      onLogout={handleLogout}
      activePage={activePage}
      onNavigate={setActivePage}
      loginReferenceDate={loginReferenceDate ?? new Date()}
    />
  ) : (
    <Dashboard
      currentUser={currentUser}
      onLogout={handleLogout}
      activePage={activePage}
      onNavigate={setActivePage}
    />
  );
}
