-- accident_reports: 팀장 관리 화면에서 사고 보고서 삭제 허용
-- Supabase Dashboard → SQL Editor 에서 이 파일을 실행하세요.

DROP POLICY IF EXISTS "accident_reports_authenticated_delete" ON public.accident_reports;
CREATE POLICY "accident_reports_authenticated_delete"
  ON public.accident_reports
  FOR DELETE
  TO authenticated
  USING (true);

GRANT DELETE ON public.accident_reports TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
