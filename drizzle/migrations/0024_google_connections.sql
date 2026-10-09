CREATE TABLE public.google_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL UNIQUE REFERENCES public.partners(id) ON DELETE CASCADE,
  google_email text,
  refresh_token text,
  access_token text,
  expires_at timestamptz,
  connected_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.google_connections TO service_role;
REVOKE ALL ON public.google_connections FROM anon, authenticated;
ALTER TABLE public.google_connections ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.my_google_status()
RETURNS TABLE(connected boolean, google_email text, connected_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (g.id IS NOT NULL), g.google_email, g.connected_at
  FROM (SELECT public.current_partner_id() AS pid) p
  LEFT JOIN public.google_connections g ON g.partner_id = p.pid;
$$;
REVOKE ALL ON FUNCTION public.my_google_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_google_status() TO authenticated;