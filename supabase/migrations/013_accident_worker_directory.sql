-- 사고 보고서(/report) 근무자 자동완성용 조회 함수
-- Supabase Dashboard → SQL Editor 에서 이 파일을 실행하세요.

CREATE OR REPLACE FUNCTION public.get_accident_worker_directory()
RETURNS TABLE (
  member_id text,
  name text,
  grade text,
  department text,
  duties text[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    tm."사번" AS member_id,
    tm."성명" AS name,
    COALESCE(NULLIF(trim(tm."직급"), ''), NULLIF(trim(tm."직위"), ''), '사원') AS grade,
    COALESCE(NULLIF(trim(tm."소속"), ''), '미지정') AS department,
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
$$;

REVOKE ALL ON FUNCTION public.get_accident_worker_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_accident_worker_directory() TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
