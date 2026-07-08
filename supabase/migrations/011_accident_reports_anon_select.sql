-- accident_reports: 공개 보고서 페이지에서 지난 사고 불러오기용 익명 조회 허용
-- Supabase Dashboard → SQL Editor 에서 이 파일을 실행하세요.

DROP POLICY IF EXISTS "accident_reports_anon_select" ON public.accident_reports;
CREATE POLICY "accident_reports_anon_select"
  ON public.accident_reports
  FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON public.accident_reports TO anon;

NOTIFY pgrst, 'reload schema';
