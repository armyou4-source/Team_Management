-- 사고 보고서(/report) 공개 페이지: 익명(anon)에서도 지난 사고·근무자 조회 가능
-- Supabase Dashboard → SQL Editor 에서 이 파일을 실행하세요.

-- 1) accident_reports 익명 SELECT (직접 조회 fallback)
DROP POLICY IF EXISTS "accident_reports_anon_select" ON public.accident_reports;
CREATE POLICY "accident_reports_anon_select"
  ON public.accident_reports
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.accident_reports TO anon;

-- 2) 지난 사고 불러오기용 RPC (RLS와 무관하게 조회)
CREATE OR REPLACE FUNCTION public.get_accident_report_history(p_limit integer DEFAULT 20)
RETURNS TABLE (
  id uuid,
  report_date text,
  department_name text,
  author_name text,
  broadcast_media text,
  accident_datetime text,
  location text,
  program_name text,
  workers text,
  accident_summary text,
  accident_details text,
  accident_cause text,
  follow_up_actions text,
  other_notes text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    ar.id,
    ar.report_date,
    ar.department_name,
    ar.author_name,
    ar.broadcast_media,
    ar.accident_datetime,
    ar.location,
    ar.program_name,
    ar.workers,
    ar.accident_summary,
    ar.accident_details,
    ar.accident_cause,
    ar.follow_up_actions,
    ar.other_notes,
    ar.created_at
  FROM public.accident_reports ar
  ORDER BY ar.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
$$;

-- 3) 근무자 자동완성용 RPC (role / 직무 컬럼 모두 지원)
CREATE OR REPLACE FUNCTION public.get_accident_worker_directory()
RETURNS TABLE (
  member_id text,
  name text,
  grade text,
  department text,
  duties text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shift_members'
      AND column_name = '직무'
  ) THEN
    RETURN QUERY
    SELECT
      tm."사번"::text AS member_id,
      tm."성명"::text AS name,
      COALESCE(NULLIF(trim(tm."직급"), ''), NULLIF(trim(tm."직위"), ''), '사원')::text AS grade,
      COALESCE(NULLIF(trim(tm."소속"), ''), '미지정')::text AS department,
      COALESCE(
        array_agg(DISTINCT NULLIF(trim(sm."직무"), '') ORDER BY NULLIF(trim(sm."직무"), ''))
          FILTER (WHERE NULLIF(trim(sm."직무"), '') IS NOT NULL),
        ARRAY[]::text[]
      ) AS duties
    FROM public.team_member tm
    LEFT JOIN public.shift_members sm ON sm.member_id = tm."사번"
    WHERE COALESCE(tm."재직상태", '재직') = '재직'
    GROUP BY tm."사번", tm."성명", tm."직급", tm."직위", tm."소속"
    ORDER BY tm."성명";
  ELSE
    RETURN QUERY
    SELECT
      tm."사번"::text AS member_id,
      tm."성명"::text AS name,
      COALESCE(NULLIF(trim(tm."직급"), ''), NULLIF(trim(tm."직위"), ''), '사원')::text AS grade,
      COALESCE(NULLIF(trim(tm."소속"), ''), '미지정')::text AS department,
      COALESCE(
        array_agg(DISTINCT NULLIF(trim(sm.role), '') ORDER BY NULLIF(trim(sm.role), ''))
          FILTER (WHERE NULLIF(trim(sm.role), '') IS NOT NULL),
        ARRAY[]::text[]
      ) AS duties
    FROM public.team_member tm
    LEFT JOIN public.shift_members sm ON sm.member_id = tm."사번"
    WHERE COALESCE(tm."재직상태", '재직') = '재직'
    GROUP BY tm."사번", tm."성명", tm."직급", tm."직위", tm."소속"
    ORDER BY tm."성명";
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_accident_report_history(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_accident_worker_directory() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_accident_report_history(integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_accident_worker_directory() TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
