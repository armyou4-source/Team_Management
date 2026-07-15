-- team_interview / team_interview_history: '미입력' → '미면담' 상태명 변경
-- Supabase Dashboard → SQL Editor 에서 이 파일을 실행하세요.
-- 주의: 기존 CHECK를 먼저 제거한 뒤 데이터를 바꾸고, 새 CHECK를 다시 겁니다.

-- 1) 기존 CHECK 제거 (UPDATE가 막히지 않도록)
ALTER TABLE public.team_interview
  DROP CONSTRAINT IF EXISTS team_interview_상태_check;

ALTER TABLE public.team_interview_history
  DROP CONSTRAINT IF EXISTS team_interview_history_상태_check;

-- 2) 데이터 변경
UPDATE public.team_interview
SET "상태" = '미면담'
WHERE "상태" = '미입력';

UPDATE public.team_interview_history
SET "상태" = '미면담'
WHERE "상태" = '미입력';

-- 3) 기본값 변경
ALTER TABLE public.team_interview
  ALTER COLUMN "상태" SET DEFAULT '미면담';

-- 4) 새 CHECK 추가
ALTER TABLE public.team_interview
  ADD CONSTRAINT team_interview_상태_check
  CHECK ("상태" IN ('미면담', '면담완료', '작성중', '저장완료', '대상외'));

ALTER TABLE public.team_interview_history
  ADD CONSTRAINT team_interview_history_상태_check
  CHECK ("상태" IN ('미면담', '면담완료', '작성중', '저장완료', '대상외'));

COMMENT ON COLUMN public.team_interview."상태" IS '미면담 | 면담완료 | 작성중 | 저장완료 | 대상외';
COMMENT ON COLUMN public.team_interview_history."상태" IS '미면담 | 면담완료 | 작성중 | 저장완료 | 대상외';

NOTIFY pgrst, 'reload schema';
