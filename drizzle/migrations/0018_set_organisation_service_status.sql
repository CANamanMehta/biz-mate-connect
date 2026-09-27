CREATE OR REPLACE FUNCTION public.set_organisation_service_status(_organisation_id uuid, _service_line_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_actor uuid := public.current_partner_id(); v_name text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT name INTO v_name FROM public.service_lines WHERE id = _service_line_id;
  IF v_name IS NULL OR NOT EXISTS (SELECT 1 FROM public.organisations WHERE id = _organisation_id) THEN RAISE EXCEPTION 'Not found'; END IF;
  IF _status = 'not_offered' THEN
    DELETE FROM public.organisation_services WHERE organisation_id = _organisation_id AND service_line_id = _service_line_id;
  ELSIF _status IN ('engaged','pitched','not_relevant') THEN
    INSERT INTO public.organisation_services (organisation_id, service_line_id, status, created_by)
    VALUES (_organisation_id, _service_line_id, _status::organisation_service_status, v_actor)
    ON CONFLICT (organisation_id, service_line_id) DO UPDATE SET status = EXCLUDED.status;
  ELSE RAISE EXCEPTION 'Invalid status'; END IF;
  INSERT INTO public.activity_log (organisation_id, actor_partner_id, action, detail)
  VALUES (_organisation_id, v_actor, 'service_status_changed', v_name || ' marked ' || replace(_status, '_', ' '));
END $$;
REVOKE ALL ON FUNCTION public.set_organisation_service_status(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_organisation_service_status(uuid, uuid, text) TO authenticated;