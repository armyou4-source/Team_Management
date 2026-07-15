-- team_interview / team_interview_history: '미입력' → '미면담' 상태명 변경
-- Supabase Dashboard → SQL Editor 에서 이 파일을 실행하세요.

UPDATE public.team_interview
SET "상태" = '미면담'
WHERE "상태" = '미입력';

UPDATE public.team_interview_history
SET "상태" = '미면담'
WHERE "상태" = '미입력';

ALTER TABLE public.team_interview
  ALTER COLUMN "상태" SET DEFAULT '미면담';

ALTER TABLE public.team_interview
  DROP CONSTRAINT IF EXISTS team_interview_상태_check;

ALTER TABLE public.team_interview
  ADD CONSTRAINT team_interview_상태_check
  CHECK ("상태" IN ('미면담', '면담완료', '작성중', '저장완료', '대상외'));

ALTER TABLE public.team_interview_history
  DROP CONSTRAINT IF EXISTS team_interview_history_상태_check;

ALTER TABLE public.team_interview_history
  ADD CONSTRAINT team_interview_history_상태_check
  CHECK ("상태" IN ('미면담', '면담완료', '작성중', '저장완료', '대상외'));

COMMENT ON COLUMN public.team_interview."상태" IS '미면담 | 면담완료 | 작성중 | 저장완료 | 대상외';
COMMENT ON COLUMN public.team_interview_history."상태" IS '미면담 | 면담완료 | 작성중 | 저장완료 | 대상외';

NOTIFY pgrst, 'reload schema';
