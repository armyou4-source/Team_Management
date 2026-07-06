-- accident_reports: 공식 양식 필드 확장
-- Supabase Dashboard → SQL Editor 에서 이 파일을 실행하세요.

ALTER TABLE public.accident_reports
  ADD COLUMN IF NOT EXISTS report_date TEXT,
  ADD COLUMN IF NOT EXISTS department_name TEXT,
  ADD COLUMN IF NOT EXISTS broadcast_media TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS workers TEXT,
  ADD COLUMN IF NOT EXISTS accident_summary TEXT,
  ADD COLUMN IF NOT EXISTS accident_details TEXT,
  ADD COLUMN IF NOT EXISTS accident_cause TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_actions TEXT,
  ADD COLUMN IF NOT EXISTS other_notes TEXT;

COMMENT ON COLUMN public.accident_reports.report_date IS '보고서 작성 일자';
COMMENT ON COLUMN public.accident_reports.department_name IS '보고 부서명';
COMMENT ON COLUMN public.accident_reports.broadcast_media IS '방송 매체 (쉼표 구분)';
COMMENT ON COLUMN public.accident_reports.location IS '발생 장소';
COMMENT ON COLUMN public.accident_reports.workers IS '근무자';
COMMENT ON COLUMN public.accident_reports.accident_summary IS '사고 내용 요약';
COMMENT ON COLUMN public.accident_reports.accident_details IS '사고 경위';
COMMENT ON COLUMN public.accident_reports.accident_cause IS '사고 원인';
COMMENT ON COLUMN public.accident_reports.follow_up_actions IS '후속 조치';
COMMENT ON COLUMN public.accident_reports.other_notes IS '기타';

NOTIFY pgrst, 'reload schema';
