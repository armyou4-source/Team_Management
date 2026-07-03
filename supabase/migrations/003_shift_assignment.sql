-- Reference schema for shift assignment feature (may already exist in Supabase)
--
-- shifts: id 1~6 = 1조~6조, id 7 = 상시/기타
-- shift_members:
--   standard shifts (1~6): one member per (shift_id, role)
--   standing shift (7): multiple members per role allowed

CREATE TABLE IF NOT EXISTS public.shifts (
  id integer PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.shift_members (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shift_id integer NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  member_id text NOT NULL REFERENCES public.team_member("사번") ON DELETE CASCADE,
  role text NOT NULL,
  UNIQUE (shift_id, role, member_id)
);

CREATE INDEX IF NOT EXISTS shift_members_shift_id_idx ON public.shift_members (shift_id);
CREATE INDEX IF NOT EXISTS shift_members_member_id_idx ON public.shift_members (member_id);
