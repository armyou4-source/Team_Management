-- accident_reports: 작성자(anon RPC) 및 팀장(authenticated) 수정 허용
-- Supabase Dashboard → SQL Editor 에서 이 파일을 실행하세요.

DROP POLICY IF EXISTS "accident_reports_authenticated_update" ON public.accident_reports;
CREATE POLICY "accident_reports_authenticated_update"
  ON public.accident_reports
  FOR UPDATE
  TO authenticated
  USING (public.auth_uid_is_team_leader())
  WITH CHECK (public.auth_uid_is_team_leader());

GRANT UPDATE ON public.accident_reports TO authenticated;

CREATE OR REPLACE FUNCTION public.update_accident_report_by_author(
  p_report_id uuid,
  p_author_name text,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_report_id IS NULL THEN
    RAISE EXCEPTION 'report id is required';
  END IF;

  IF NULLIF(trim(p_author_name), '') IS NULL THEN
    RAISE EXCEPTION 'author name is required';
  END IF;

  IF p_payload IS NULL OR p_payload = '{}'::jsonb THEN
    RAISE EXCEPTION 'payload is required';
  END IF;

  UPDATE public.accident_reports ar
  SET
    report_date = COALESCE(NULLIF(trim(p_payload->>'report_date'), ''), ar.report_date),
    department_name = COALESCE(NULLIF(trim(p_payload->>'department_name'), ''), ar.department_name),
    author_name = COALESCE(NULLIF(trim(p_payload->>'author_name'), ''), ar.author_name),
    broadcast_media = COALESCE(NULLIF(trim(p_payload->>'broadcast_media'), ''), ar.broadcast_media),
    accident_datetime = COALESCE(NULLIF(trim(p_payload->>'accident_datetime'), ''), ar.accident_datetime),
    location = COALESCE(NULLIF(trim(p_payload->>'location'), ''), ar.location),
    program_name = COALESCE(NULLIF(trim(p_payload->>'program_name'), ''), ar.program_name),
    workers = COALESCE(NULLIF(trim(p_payload->>'workers'), ''), ar.workers),
    accident_summary = COALESCE(p_payload->>'accident_summary', ar.accident_summary),
    accident_details = COALESCE(p_payload->>'accident_details', ar.accident_details),
    accident_cause = COALESCE(p_payload->>'accident_cause', ar.accident_cause),
    follow_up_actions = COALESCE(p_payload->>'follow_up_actions', ar.follow_up_actions),
    other_notes = COALESCE(p_payload->>'other_notes', ar.other_notes),
    accident_content = COALESCE(NULLIF(trim(p_payload->>'accident_content'), ''), ar.accident_content),
    cause_and_measures = COALESCE(NULLIF(trim(p_payload->>'cause_and_measures'), ''), ar.cause_and_measures)
  WHERE ar.id = p_report_id
    AND trim(ar.author_name) = trim(p_author_name);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not authorized to update this report';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_accident_report_by_author(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_accident_report_by_author(uuid, text, jsonb)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
