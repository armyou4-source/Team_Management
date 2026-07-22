-- team_interview / team_interview_history: 면담 시기(차수) 관리
-- Supabase Dashboard → SQL Editor 에서 이 파일을 실행하세요.

ALTER TABLE public.team_interview
  ADD COLUMN IF NOT EXISTS interview_period TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE public.team_interview_history
  ADD COLUMN IF NOT EXISTS interview_period TEXT;

UPDATE public.team_interview
SET interview_period = 'legacy'
WHERE interview_period IS NULL OR interview_period = '';

ALTER TABLE public.team_interview
  DROP CONSTRAINT IF EXISTS team_interview_pkey;

ALTER TABLE public.team_interview
  ADD CONSTRAINT team_interview_pkey PRIMARY KEY ("사번", interview_period);

CREATE TABLE IF NOT EXISTS public.team_interview_periods (
  period_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  year INTEGER NOT NULL,
  purpose_type TEXT NOT NULL
    CHECK (purpose_type IN ('중간면담', '성과평가', '수시면담')),
  is_active BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

COMMENT ON TABLE public.team_interview_periods IS '면담 관리 차수(시기) 목록';
COMMENT ON COLUMN public.team_interview.interview_period IS '면담 시기 키 (예: 2026-중간면담)';

INSERT INTO public.team_interview_periods (period_key, label, year, purpose_type, is_active)
VALUES ('legacy', '이전 기록', EXTRACT(YEAR FROM NOW())::INTEGER, '중간면담', true)
ON CONFLICT (period_key) DO NOTHING;

UPDATE public.team_interview_periods
SET is_active = false, archived_at = NULL
WHERE period_key <> 'legacy';

UPDATE public.team_interview_periods
SET is_active = true, archived_at = NULL
WHERE period_key = 'legacy';

CREATE INDEX IF NOT EXISTS team_interview_period_idx
  ON public.team_interview (interview_period);

CREATE INDEX IF NOT EXISTS team_interview_history_period_idx
  ON public.team_interview_history ("사번", interview_period, saved_at DESC);

ALTER TABLE public.team_interview_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_interview_periods_anon_all" ON public.team_interview_periods;
CREATE POLICY "team_interview_periods_anon_all"
  ON public.team_interview_periods
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_interview_periods TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
