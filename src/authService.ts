import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

export interface TeamMemberProfile {
  사번: string;
  성명: string;
  직급: string | null;
  직위: string | null;
  소속: string;
  구분: string | null;
  auth_user_id: string | null;
  email: string | null;
}

export type AuthPhase = 'loading' | 'unauthenticated' | 'unauthorized' | 'ready';

export type UnauthorizedReason =
  | 'PROFILE_NOT_FOUND'
  | 'NOT_TEAM_LEADER'
  | 'PROFILE_QUERY_FAILED';

export interface AuthUserInfo {
  id: string;
  email: string | null;
}

export interface PermissionCheckStep {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface PermissionCheckResult {
  steps: PermissionCheckStep[];
  reason: UnauthorizedReason | null;
  summary: string;
}

export interface ResolvedAuth {
  phase: AuthPhase;
  session: Session | null;
  profile: TeamMemberProfile | null;
  authUser: AuthUserInfo | null;
  matchedBy: 'auth_user_id' | 'email' | null;
  permissionCheck: PermissionCheckResult | null;
  errorMessage?: string;
}

const mapTeamMemberRow = (row: Record<string, unknown>): TeamMemberProfile => ({
  사번: String(row.사번 ?? ''),
  성명: String(row.성명 ?? ''),
  직급: row.직급 != null ? String(row.직급) : null,
  직위: row.직위 != null ? String(row.직위) : null,
  소속: String(row.소속 ?? ''),
  구분: row.구분 != null ? String(row.구분) : null,
  auth_user_id: row.auth_user_id != null ? String(row.auth_user_id) : null,
  email: row.email != null ? String(row.email) : null,
});

const toAuthUserInfo = (user: User): AuthUserInfo => ({
  id: user.id,
  email: user.email ?? null,
});

const formatSupabaseError = (error: { message: string; code?: string; details?: string }): string =>
  `${error.message}${error.code ? ` (code: ${error.code})` : ''}${error.details ? ` — ${error.details}` : ''}`;

/** 로그인 직후 JWT가 API 요청에 반영되도록 세션을 클라이언트에 설정 (이미 동일 세션이면 스킵) */
export const ensureClientSession = async (session: Session | null): Promise<void> => {
  if (!session?.access_token || !session.refresh_token) return;

  const { data: { session: current } } = await supabase.auth.getSession();
  if (
    current?.access_token === session.access_token &&
    current?.user?.id === session.user?.id
  ) {
    return;
  }

  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  if (error) {
    throw new Error(`세션 설정 실패: ${error.message}`);
  }
};

/**
 * 로그인한 Auth UID(auth.uid())로 본인 team_member 프로필 조회
 * 사번이 아닌 auth_user_id 컬럼과 비교합니다.
 */
export const fetchMyProfileByAuthUserId = async (
  authUserId: string
): Promise<TeamMemberProfile | null> => {
  const { data, error } = await supabase
    .from('team_member')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (error) {
    throw new Error(formatSupabaseError(error));
  }

  if (!data) return null;

  return mapTeamMemberRow(data as Record<string, unknown>);
};

/** auth_user_id로 찾지 못했을 때만 email로 보조 조회 */
export const fetchMyProfileByEmail = async (email: string): Promise<TeamMemberProfile | null> => {
  const { data, error } = await supabase
    .from('team_member')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    const message = error.message ?? '';
    if (message.includes('column') || message.includes('does not exist')) {
      return null;
    }
    throw new Error(formatSupabaseError(error));
  }

  if (!data) return null;

  return mapTeamMemberRow(data as Record<string, unknown>);
};

export const isTeamLeader = (profile: TeamMemberProfile | null): boolean =>
  profile?.직위?.trim() === '팀장';

export const signInWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  if (data.session) {
    await ensureClientSession(data.session);
  }

  return data;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const resolveMemberProfile = async (
  user: User
): Promise<{ profile: TeamMemberProfile | null; matchedBy: 'auth_user_id' | 'email' | null }> => {
  const byAuthUserId = await fetchMyProfileByAuthUserId(user.id);
  if (byAuthUserId) {
    return { profile: byAuthUserId, matchedBy: 'auth_user_id' };
  }

  if (user.email) {
    const byEmail = await fetchMyProfileByEmail(user.email);
    if (byEmail) {
      return { profile: byEmail, matchedBy: 'email' };
    }
  }

  return { profile: null, matchedBy: null };
};

const buildPermissionCheck = ({
  authUser,
  profile,
  matchedBy,
  reason,
  queryError,
}: {
  authUser: AuthUserInfo;
  profile: TeamMemberProfile | null;
  matchedBy: 'auth_user_id' | 'email' | null;
  reason: UnauthorizedReason;
  queryError?: string;
}): PermissionCheckResult => {
  const loginPassed = true;
  const profilePassed = profile != null;
  const leaderPassed = isTeamLeader(profile);

  const matchDetail = profilePassed
    ? matchedBy === 'auth_user_id'
      ? `team_member.auth_user_id = auth.uid() (${authUser.id})`
      : `team_member.email = ${authUser.email}`
    : `team_member.auth_user_id = '${authUser.id}' 조건으로 프로필을 찾지 못했습니다.`;

  const leaderDetail = profilePassed
    ? leaderPassed
      ? `현재 직위: ${profile?.직위}`
      : `현재 직위: ${profile?.직위 ?? '미등록'} — 팀장만 접근 가능합니다.`
    : '프로필이 없어 직위를 확인할 수 없습니다.';

  const steps: PermissionCheckStep[] = [
    {
      id: 'login',
      label: 'Supabase Auth 로그인',
      passed: loginPassed,
      detail: `auth.uid(): ${authUser.id}`,
    },
    {
      id: 'profile',
      label: 'team_member 프로필 연결 (auth_user_id)',
      passed: profilePassed,
      detail: matchDetail,
    },
    {
      id: 'leader',
      label: '팀장 직위 확인',
      passed: leaderPassed,
      detail: leaderDetail,
    },
  ];

  const summary =
    reason === 'PROFILE_QUERY_FAILED'
      ? queryError?.includes('42P17')
        ? 'team_member RLS 정책 재귀 오류(42P17)입니다. Supabase SQL Editor에서 supabase/migrations/002_fix_team_member_rls.sql 을 실행해 주세요.'
        : queryError ?? '프로필 조회 중 오류가 발생했습니다.'
      : reason === 'PROFILE_NOT_FOUND'
        ? `auth_user_id에 로그인 UID(${authUser.id})가 연결된 team_member 행이 없습니다.`
        : '연결된 프로필이 있으나 팀장 직위가 아닙니다.';

  return { steps, reason, summary };
};

export const resolveAuthPhase = async (
  sessionOverride?: Session | null,
  options?: { skipEnsureSession?: boolean }
): Promise<ResolvedAuth> => {
  let session = sessionOverride ?? null;

  if (session) {
    if (!options?.skipEnsureSession) {
      await ensureClientSession(session);
    }
  } else {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    session = data.session;
  }

  if (!session?.user) {
    return {
      phase: 'unauthenticated',
      session: null,
      profile: null,
      authUser: null,
      matchedBy: null,
      permissionCheck: null,
    };
  }

  const authUser = toAuthUserInfo(session.user);

  try {
    const { profile, matchedBy } = await resolveMemberProfile(session.user);

    if (!profile) {
      const permissionCheck = buildPermissionCheck({
        authUser,
        profile: null,
        matchedBy: null,
        reason: 'PROFILE_NOT_FOUND',
      });

      return {
        phase: 'unauthorized',
        session,
        profile: null,
        authUser,
        matchedBy: null,
        permissionCheck,
        errorMessage: permissionCheck.summary,
      };
    }

    if (!isTeamLeader(profile)) {
      const permissionCheck = buildPermissionCheck({
        authUser,
        profile,
        matchedBy,
        reason: 'NOT_TEAM_LEADER',
      });

      return {
        phase: 'unauthorized',
        session,
        profile,
        authUser,
        matchedBy,
        permissionCheck,
        errorMessage: permissionCheck.summary,
      };
    }

    return {
      phase: 'ready',
      session,
      profile,
      authUser,
      matchedBy,
      permissionCheck: null,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '프로필 조회 중 오류가 발생했습니다.';
    const permissionCheck = buildPermissionCheck({
      authUser,
      profile: null,
      matchedBy: null,
      reason: 'PROFILE_QUERY_FAILED',
      queryError: message,
    });

    return {
      phase: 'unauthorized',
      session,
      profile: null,
      authUser,
      matchedBy: null,
      permissionCheck,
      errorMessage: message,
    };
  }
};

// 이전 이름 호환
export const fetchProfileByAuthUserId = fetchMyProfileByAuthUserId;
export const fetchProfileByEmail = fetchMyProfileByEmail;
export const fetchCurrentMemberProfile = async (user?: User | null): Promise<TeamMemberProfile | null> => {
  const authUser = user ?? (await supabase.auth.getUser()).data.user;
  if (!authUser) return null;
  const { profile } = await resolveMemberProfile(authUser);
  return profile;
};
