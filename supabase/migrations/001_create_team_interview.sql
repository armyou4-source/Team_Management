-- team_interview: 부서원별 인사 면담 기록 (면담 관리 대시보드)
-- Supabase Dashboard → SQL Editor 에서 이 파일 전체를 실행하세요.

-- 오타로 만든 테이블이 있으면 제거 (team_interveiw)
DROP TABLE IF EXISTS public.team_interveiw;

-- 기존 team_interview 가 잘못 만들어졌을 수 있으므로 재생성 (데이터 없을 때 안전)
DROP TABLE IF EXISTS public.team_interview CASCADE;

CREATE TABLE public.team_interview (
  "사번" TEXT PRIMARY KEY,
  "성명" TEXT,
  "직급" TEXT,
  "소속" TEXT,
  "면담일자" DATE,
  "면담목적" TEXT,
  "주요면담내용" TEXT,
  "피드백조치" TEXT,
  "제안민원" TEXT,
  "상태" TEXT NOT NULL DEFAULT '미입력'
    CHECK ("상태" IN ('미입력', '작성중', '저장완료', '대상외')),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.team_interview IS '부서원 인사 면담 기록';
COMMENT ON COLUMN public.team_interview."사번" IS '사원 식별 키 (앱에서 생성)';
COMMENT ON COLUMN public.team_interview."면담일자" IS '면담 일자';
COMMENT ON COLUMN public.team_interview."면담목적" IS '면담 목적';
COMMENT ON COLUMN public.team_interview."주요면담내용" IS '주요 면담 내용';
COMMENT ON COLUMN public.team_interview."피드백조치" IS '피드백 및 조치';
COMMENT ON COLUMN public.team_interview."제안민원" IS '제안 및 민원';
COMMENT ON COLUMN public.team_interview."상태" IS '미입력 | 작성중 | 저장완료 | 대상외';

CREATE INDEX team_interview_status_idx ON public.team_interview ("상태");
CREATE INDEX team_interview_updated_at_idx ON public.team_interview ("updated_at" DESC);

CREATE OR REPLACE FUNCTION public.team_interview_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."updated_at" = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_interview_updated_at ON public.team_interview;
CREATE TRIGGER team_interview_updated_at
  BEFORE UPDATE ON public.team_interview
  FOR EACH ROW
  EXECUTE FUNCTION public.team_interview_set_updated_at();

ALTER TABLE public.team_interview ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_interview_anon_all" ON public.team_interview;
CREATE POLICY "team_interview_anon_all"
  ON public.team_interview
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_interview TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
