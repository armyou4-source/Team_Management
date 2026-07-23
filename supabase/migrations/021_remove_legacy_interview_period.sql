-- 면담 시기 목록에서 '이전 기록(legacy)' 항목 제거
-- Supabase Dashboard → SQL Editor 에서 이 파일을 실행하세요.
-- 020_assign_2026_midterm_period.sql 실행 후 실행하세요.

DELETE FROM public.team_interview_periods
WHERE period_key = 'legacy';

NOTIFY pgrst, 'reload schema';
