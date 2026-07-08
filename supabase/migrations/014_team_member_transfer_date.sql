-- team_member: 부서 전입 날짜 컬럼 추가
-- Supabase Dashboard → SQL Editor 에서 이 파일을 실행하세요.

ALTER TABLE public.team_member
  ADD COLUMN IF NOT EXISTS transfer_date date;

COMMENT ON COLUMN public.team_member.transfer_date IS '부서 전입 날짜';

DROP POLICY IF EXISTS team_member_update_managed ON public.team_member;
CREATE POLICY team_member_update_managed
  ON public.team_member
  FOR UPDATE
  TO authenticated
  USING (
    public.auth_uid_is_team_leader()
    AND "소속" IN (SELECT public.auth_uid_visible_sosok())
  )
  WITH CHECK (
    public.auth_uid_is_team_leader()
    AND "소속" IN (SELECT public.auth_uid_visible_sosok())
  );

GRANT UPDATE ON public.team_member TO authenticated;

NOTIFY pgrst, 'reload schema';
