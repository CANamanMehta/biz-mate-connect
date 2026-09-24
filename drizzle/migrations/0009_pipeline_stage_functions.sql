CREATE OR REPLACE FUNCTION public.move_opportunity_stage(_opportunity_id uuid, _stage opportunity_stage, _probability integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_actor uuid := public.current_partner_id(); v_org uuid; v_old opportunity_stage;
BEGIN
  IF v_actor IS NULL OR NOT public.can_edit_opportunity(_opportunity_id) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF _probability < 0 OR _probability > 100 THEN RAISE EXCEPTION 'Probability must be 0-100'; END IF;
  IF _stage = 'converted' THEN RAISE EXCEPTION 'Use the conversion flow'; END IF;
  SELECT organisation_id, stage INTO v_org, v_old FROM public.opportunities WHERE id = _opportunity_id AND status = 'open';
  IF v_org IS NULL THEN RAISE EXCEPTION 'Open opportunity not found'; END IF;
  UPDATE public.opportunities SET stage = _stage, probability = _probability,
    stage_changed_at = CASE WHEN v_old <> _stage THEN now() ELSE stage_changed_at END,
    last_activity_date = current_date WHERE id = _opportunity_id;
  INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
  VALUES (v_org, _opportunity_id, v_actor, 'stage_changed',
    replace(v_old::text,'_',' ') || ' → ' || replace(_stage::text,'_',' ') || ' (' || _probability || '%)');
END; $$;

CREATE OR REPLACE FUNCTION public.set_opportunity_status(_opportunity_id uuid, _action text, _revisit_date date DEFAULT NULL, _lost_reason lost_reason DEFAULT NULL, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_actor uuid := public.current_partner_id(); v_org uuid; v_detail text;
BEGIN
  IF v_actor IS NULL OR NOT public.can_edit_opportunity(_opportunity_id) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  SELECT organisation_id INTO v_org FROM public.opportunities WHERE id = _opportunity_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Opportunity not found'; END IF;
  IF _action = 'hold' THEN
    IF _revisit_date IS NULL THEN RAISE EXCEPTION 'Revisit date required'; END IF;
    UPDATE public.opportunities SET status='on_hold', on_hold_revisit_date=_revisit_date, last_activity_date=current_date WHERE id=_opportunity_id;
    v_detail := 'Put on hold until ' || _revisit_date;
  ELSIF _action = 'lost' THEN
    IF _lost_reason IS NULL THEN RAISE EXCEPTION 'Lost reason required'; END IF;
    UPDATE public.opportunities SET status='lost', lost_reason=_lost_reason, lost_note=nullif(trim(_note),''), last_activity_date=current_date WHERE id=_opportunity_id;
    v_detail := 'Marked lost: ' || replace(_lost_reason::text,'_',' ') || coalesce(' — ' || nullif(trim(_note),''), '');
  ELSIF _action = 'disqualify' THEN
    IF nullif(trim(_note),'') IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;
    UPDATE public.opportunities SET status='disqualified', lost_note=trim(_note), last_activity_date=current_date WHERE id=_opportunity_id;
    v_detail := 'Disqualified: ' || trim(_note);
  ELSIF _action = 'reopen' THEN
    UPDATE public.opportunities SET status='open', on_hold_revisit_date=NULL, stage_changed_at=now(), last_activity_date=current_date WHERE id=_opportunity_id;
    v_detail := 'Reopened';
  ELSE RAISE EXCEPTION 'Invalid action'; END IF;
  INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
  VALUES (v_org, _opportunity_id, v_actor, 'status_' || _action, v_detail);
END; $$;

REVOKE ALL ON FUNCTION public.move_opportunity_stage(uuid, opportunity_stage, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_opportunity_status(uuid, text, date, lost_reason, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_opportunity_stage(uuid, opportunity_stage, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_opportunity_status(uuid, text, date, lost_reason, text) TO authenticated;