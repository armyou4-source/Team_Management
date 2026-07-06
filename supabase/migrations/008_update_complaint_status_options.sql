-- 건의상태에 '표시안함' 옵션 추가
-- Supabase Dashboard → SQL Editor 에서 이 파일을 실행하세요.

ALTER TABLE public.team_interview
  DROP CONSTRAINT IF EXISTS team_interview_건의상태_check;

ALTER TABLE public.team_interview
  ADD CONSTRAINT team_interview_건의상태_check
    CHECK ("건의상태" IS NULL OR "건의상태" IN ('확인', '진행중', '완료', '표시안함'));

ALTER TABLE public.team_interview_history
  DROP CONSTRAINT IF EXISTS team_interview_history_건의상태_check;

ALTER TABLE public.team_interview_history
  ADD CONSTRAINT team_interview_history_건의상태_check
    CHECK ("건의상태" IS NULL OR "건의상태" IN ('확인', '진행중', '완료', '표시안함'));

COMMENT ON COLUMN public.team_interview."건의상태" IS '건의·제안·민원 처리 상태: 확인 | 진행중 | 완료 | 표시안함';
COMMENT ON COLUMN public.team_interview_history."건의상태" IS '건의·제안·민원 처리 상태: 확인 | 진행중 | 완료 | 표시안함';

NOTIFY pgrst, 'reload schema';
