-- Fix: infinite recursion detected in policy for relation "team_member" (42P17)
--
-- departments 구조:
--   id         TEXT  — 부서명 (예: '보도기술팀'), team_member."소속"과 매칭
--   parent_id  TEXT  — 상위 부서 id (departments.id 참조)
--
-- Supabase Dashboard → SQL Editor 에서 이 파일 전체를 실행하세요.

-- 1) 기존 team_member / departments RLS 정책 제거
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('team_member', 'departments')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      pol.policyname,
      pol.schemaname,
      pol.tablename
    );
  END LOOP;
END $$;

-- 2) RLS 헬퍼 함수 (SECURITY DEFINER = 정책 평가 시 RLS 재귀 방지)
CREATE OR REPLACE FUNCTION public.auth_uid_is_team_leader()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_member
    WHERE auth_user_id = auth.uid()
      AND trim("직위") = '팀장'
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_uid_team_leader_sosok()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "소속"
  FROM public.team_member
  WHERE auth_user_id = auth.uid()
    AND trim("직위") = '팀장'
  LIMIT 1;
$$;

-- 팀장 본인 소속(team_member."소속") + departments 하위 부서(id) 목록 반환
-- team_member."소속" = departments.id 로 매칭, 하위는 parent_id 재귀 탐색
CREATE OR REPLACE FUNCTION public.auth_uid_visible_sosok()
RETURNS SETOF text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  root_dept text;
BEGIN
  root_dept := public.auth_uid_team_leader_sosok();
  IF root_dept IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH RECURSIVE dept_tree AS (
    SELECT root_dept AS dept_id
    UNION ALL
    SELECT d.id
    FROM public.departments d
    INNER JOIN dept_tree t ON d.parent_id = t.dept_id
  )
  SELECT dept_id FROM dept_tree;
END;
$$;

REVOKE ALL ON FUNCTION public.auth_uid_is_team_leader() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_uid_team_leader_sosok() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_uid_visible_sosok() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_uid_is_team_leader() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_uid_team_leader_sosok() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_uid_visible_sosok() TO authenticated;

-- 3) team_member RLS 재생성
ALTER TABLE public.team_member ENABLE ROW LEVEL SECURITY;

-- 본인 프로필 (로그인/권한 체크용): auth_user_id = auth.uid()
CREATE POLICY team_member_select_own
  ON public.team_member
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

-- 팀장: 본인 팀 + departments 하위 파트 구성원
-- team_member."소속" IN (본인 소속 + 하위 departments.id)
CREATE POLICY team_member_select_managed
  ON public.team_member
  FOR SELECT
  TO authenticated
  USING (
    public.auth_uid_is_team_leader()
    AND "소속" IN (SELECT public.auth_uid_visible_sosok())
  );

-- 4) departments RLS (team_member를 정책에서 직접 조회하지 않음)
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY departments_select_authenticated
  ON public.departments
  FOR SELECT
  TO authenticated
  USING (true);

-- 5) 권한
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.team_member TO authenticated;
GRANT SELECT ON public.departments TO authenticated;

NOTIFY pgrst, 'reload schema';
