-- Fix standing shift (shift_id = 7) multi-member save
-- Run in Supabase Dashboard → SQL Editor

-- 1) Allow multiple members per role on shift 7
ALTER TABLE public.shift_members
  DROP CONSTRAINT IF EXISTS shift_members_shift_id_role_key;

ALTER TABLE public.shift_members
  DROP CONSTRAINT IF EXISTS shift_members_shift_id_role_member_id_key;

ALTER TABLE public.shift_members
  ADD CONSTRAINT shift_members_shift_id_role_member_id_key
  UNIQUE (shift_id, role, member_id);

-- If your table uses "직무" instead of "role", replace "role" above with "직무".

-- 2) RLS for team leaders (includes shift_id 7)
ALTER TABLE public.shift_members ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shift_members'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.shift_members', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY shift_members_manage_team_leader
  ON public.shift_members
  FOR ALL
  TO authenticated
  USING (public.auth_uid_is_team_leader())
  WITH CHECK (public.auth_uid_is_team_leader());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_members TO authenticated;

NOTIFY pgrst, 'reload schema';
