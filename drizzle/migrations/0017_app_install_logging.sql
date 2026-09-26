ALTER TABLE public.activity_log ALTER COLUMN organisation_id DROP NOT NULL;
CREATE OR REPLACE FUNCTION public.log_app_install(_device text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_active_partner() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
  VALUES (NULL, NULL, public.current_partner_id(), 'app_installed', left(coalesce(_device,'unknown'), 40));
END $$;
REVOKE ALL ON FUNCTION public.log_app_install(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_app_install(text) TO authenticated;