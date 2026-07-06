-- team_interview_history: 사원별 완료된 면담 기록 보관 (지난 면담 불러오기)
-- Supabase Dashboard → SQL Editor 에서 이 파일을 실행하세요.

CREATE TABLE IF NOT EXISTS public.team_interview_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "사번" TEXT NOT NULL,
  "성명" TEXT,
  "직급" TEXT,
  "소속" TEXT,
  "면담일자" DATE,
  "면담목적" TEXT,
  "주요면담내용" TEXT,
  "피드백조치" TEXT,
  "제안민원" TEXT,
  "상태" TEXT NOT NULL DEFAULT '저장완료'
    CHECK ("상태" IN ('미입력', '작성중', '저장완료', '대상외')),
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.team_interview_history IS '완료된 면담 기록 이력';
COMMENT ON COLUMN public.team_interview_history.saved_at IS '이력 저장 시각';

CREATE INDEX IF NOT EXISTS team_interview_history_employee_idx
  ON public.team_interview_history ("사번", saved_at DESC);

ALTER TABLE public.team_interview_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_interview_history_anon_all" ON public.team_interview_history;
CREATE POLICY "team_interview_history_anon_all"
  ON public.team_interview_history
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_interview_history TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
