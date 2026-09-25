CREATE OR REPLACE FUNCTION public.log_interaction(
  _organisation_id uuid, _type interaction_type, _meeting_date timestamptz,
  _next_step text, _next_step_date date,
  _opportunity_id uuid DEFAULT NULL, _duration_minutes integer DEFAULT NULL,
  _contact_ids uuid[] DEFAULT '{}', _partner_ids uuid[] DEFAULT '{}',
  _summary text DEFAULT NULL, _agenda text DEFAULT NULL, _requirements text DEFAULT NULL,
  _commitments text DEFAULT NULL, _objections text DEFAULT NULL, _decisions text DEFAULT NULL)
RETURNS TABLE(meeting_id uuid, suggest_discovery boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_actor uuid := public.current_partner_id(); v_org uuid := _organisation_id;
  v_meeting uuid; v_stage opportunity_stage; v_pid uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF nullif(trim(_next_step),'') IS NULL OR _next_step_date IS NULL THEN RAISE EXCEPTION 'Next step and date are required'; END IF;
  IF _duration_minutes IS NOT NULL AND (_duration_minutes < 0 OR _duration_minutes > 1440) THEN RAISE EXCEPTION 'Invalid duration'; END IF;
  IF _opportunity_id IS NOT NULL THEN
    IF NOT public.can_access_opportunity(_opportunity_id) THEN RAISE EXCEPTION 'Not permitted'; END IF;
    SELECT organisation_id, stage INTO v_org, v_stage FROM public.opportunities WHERE id = _opportunity_id;
  END IF;
  IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.organisations WHERE id = v_org) THEN RAISE EXCEPTION 'Organisation not found'; END IF;

  INSERT INTO public.meetings (opportunity_id, organisation_id, type, meeting_date, duration_minutes, agenda, summary,
    requirements_identified, commitments, objections, decisions, next_step, next_step_date, created_by)
  VALUES (_opportunity_id, v_org, _type, coalesce(_meeting_date, now()), _duration_minutes, nullif(trim(_agenda),''), nullif(trim(_summary),''),
    nullif(trim(_requirements),''), nullif(trim(_commitments),''), nullif(trim(_objections),''), nullif(trim(_decisions),''),
    trim(_next_step), _next_step_date, v_actor)
  RETURNING id INTO v_meeting;

  INSERT INTO public.meeting_contacts (meeting_id, contact_id)
  SELECT v_meeting, c.id FROM public.contacts c WHERE c.id = ANY(coalesce(_contact_ids,'{}')) AND c.organisation_id = v_org;

  INSERT INTO public.meeting_partners (meeting_id, partner_id)
  SELECT v_meeting, p.id FROM public.partners p WHERE p.id = ANY(coalesce(_partner_ids,'{}')) AND p.active;

  INSERT INTO public.tasks (opportunity_id, organisation_id, meeting_id, title, owner_partner_id, due_date, priority, status, source, created_by)
  VALUES (_opportunity_id, v_org, v_meeting, trim(_next_step), v_actor, _next_step_date, 'medium', 'open', 'from_meeting', v_actor);

  IF _opportunity_id IS NOT NULL THEN
    UPDATE public.opportunities SET
      last_activity_date = GREATEST(coalesce(last_activity_date, '1900-01-01'::date), (coalesce(_meeting_date, now()) AT TIME ZONE 'Asia/Kolkata')::date),
      next_action = trim(_next_step), next_action_date = _next_step_date
    WHERE id = _opportunity_id;
    IF coalesce(_duration_minutes, 0) > 0 THEN
      FOR v_pid IN SELECT mp.partner_id FROM public.meeting_partners mp WHERE mp.meeting_id = v_meeting LOOP
        INSERT INTO public.lead_costs (opportunity_id, cost_type, effort_minutes, incurred_by_partner_id, incurred_date, auto_from_meeting_id, note, created_by)
        VALUES (_opportunity_id, 'partner_time', _duration_minutes, v_pid, (coalesce(_meeting_date, now()) AT TIME ZONE 'Asia/Kolkata')::date, v_meeting, 'Auto from ' || _type::text, v_actor);
      END LOOP;
    END IF;
  END IF;

  INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
  VALUES (v_org, _opportunity_id, v_actor, 'interaction_logged',
    initcap(_type::text) || ' logged' || coalesce(': ' || left(nullif(trim(_summary),''), 140), '') || ' · Next: ' || trim(_next_step));

  RETURN QUERY SELECT v_meeting, (_type = 'meeting' AND v_stage IN ('enquiry','qualified_lead'));
END $$;
REVOKE ALL ON FUNCTION public.log_interaction(uuid, interaction_type, timestamptz, text, date, uuid, integer, uuid[], uuid[], text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_interaction(uuid, interaction_type, timestamptz, text, date, uuid, integer, uuid[], uuid[], text, text, text, text, text, text) TO authenticated, service_role;
CREATE INDEX IF NOT EXISTS meetings_meeting_date_idx ON public.meetings (meeting_date DESC);