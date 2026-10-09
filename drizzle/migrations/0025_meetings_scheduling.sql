ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS scheduled_start timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_end timestamptz,
  ADD COLUMN IF NOT EXISTS meet_link text;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS calendar_event_id text;
CREATE INDEX IF NOT EXISTS meetings_scheduled_start_idx ON public.meetings (scheduled_start) WHERE status = 'scheduled';