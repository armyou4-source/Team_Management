-- team_member 재직상태 컬럼 (CSV 동기화 스크립트용)
-- Supabase Dashboard → SQL Editor 에서 실행

ALTER TABLE public.team_member
  ADD COLUMN IF NOT EXISTS "재직상태" TEXT NOT NULL DEFAULT '재직';

ALTER TABLE public.team_member
  DROP CONSTRAINT IF EXISTS team_member_employment_status_check;

ALTER TABLE public.team_member
  ADD CONSTRAINT team_member_employment_status_check
  CHECK ("재직상태" IN ('재직', '퇴직'));

COMMENT ON COLUMN public.team_member."재직상태" IS '재직 | 퇴직 (CSV 월간 동기화)';

NOTIFY pgrst, 'reload schema';
