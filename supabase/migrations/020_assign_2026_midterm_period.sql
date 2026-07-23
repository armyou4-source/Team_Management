-- 기존 면담 기록을 2026년 중간면담 시기로 이전
-- Supabase Dashboard → SQL Editor 에서 이 파일을 실행하세요.
-- 019_interview_period.sql 실행 후 실행하세요.

UPDATE public.team_interview
SET interview_period = '2026-중간면담'
WHERE interview_period = 'legacy';

UPDATE public.team_interview_history
SET interview_period = '2026-중간면담'
WHERE interview_period IS NULL
   OR interview_period = ''
   OR interview_period = 'legacy';

INSERT INTO public.team_interview_periods (period_key, label, year, purpose_type, is_active)
VALUES ('2026-중간면담', '2026년 중간면담', 2026, '중간면담', true)
ON CONFLICT (period_key) DO UPDATE
SET label = EXCLUDED.label,
    year = EXCLUDED.year,
    purpose_type = EXCLUDED.purpose_type,
    is_active = true,
    archived_at = NULL;

UPDATE public.team_interview_periods
SET is_active = false,
    archived_at = COALESCE(archived_at, NOW())
WHERE period_key <> '2026-중간면담';

NOTIFY pgrst, 'reload schema';
