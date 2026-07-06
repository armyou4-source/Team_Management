-- accident_reports: 방송사고 보고서 (공개 작성 페이지 /report)
-- Supabase Dashboard → SQL Editor 에서 이 파일을 실행하세요.

CREATE TABLE IF NOT EXISTS public.accident_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accident_datetime TEXT NOT NULL,
  program_name TEXT NOT NULL,
  accident_content TEXT NOT NULL,
  cause_and_measures TEXT NOT NULL,
  author_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.accident_reports IS '방송사고 보고서 제출 기록';
COMMENT ON COLUMN public.accident_reports.accident_datetime IS '사고 일시';
COMMENT ON COLUMN public.accident_reports.program_name IS '방송 프로그램명';
COMMENT ON COLUMN public.accident_reports.accident_content IS '사고 내용';
COMMENT ON COLUMN public.accident_reports.cause_and_measures IS '원인 및 대책';
COMMENT ON COLUMN public.accident_reports.author_name IS '작성자 이름';

CREATE INDEX IF NOT EXISTS accident_reports_created_at_idx
  ON public.accident_reports (created_at DESC);

ALTER TABLE public.accident_reports ENABLE ROW LEVEL SECURITY;

-- 익명(anon)은 제출(INSERT)만 가능 — 다른 보고서 목록 조회 불가
DROP POLICY IF EXISTS "accident_reports_anon_insert" ON public.accident_reports;
CREATE POLICY "accident_reports_anon_insert"
  ON public.accident_reports
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 팀장 등 로그인 사용자는 조회 가능 (별도 관리 화면용, /report 페이지에는 미노출)
DROP POLICY IF EXISTS "accident_reports_authenticated_select" ON public.accident_reports;
CREATE POLICY "accident_reports_authenticated_select"
  ON public.accident_reports
  FOR SELECT
  TO authenticated
  USING (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT INSERT ON public.accident_reports TO anon, authenticated, service_role;
GRANT SELECT ON public.accident_reports TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
