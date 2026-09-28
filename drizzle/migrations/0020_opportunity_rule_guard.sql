ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS description text;

CREATE OR REPLACE FUNCTION public.opportunities_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_flag text := coalesce(current_setting('aom.approved_change', true), '');
BEGIN
  IF (NEW.stage IS DISTINCT FROM OLD.stage OR NEW.status IS DISTINCT FROM OLD.status OR NEW.probability IS DISTINCT FROM OLD.probability)
     AND v_flag NOT IN ('on','conversion') THEN
    RAISE EXCEPTION 'Stage, status and probability can only be changed through the app''s pipeline actions' USING ERRCODE = '42501';
  END IF;
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    IF NEW.stage IN ('enquiry','meeting_discovery') THEN RAISE EXCEPTION 'This stage is no longer used'; END IF;
    IF NEW.stage = 'converted' AND v_flag <> 'conversion' THEN RAISE EXCEPTION 'Use the conversion flow to mark a deal Converted'; END IF;
    IF OLD.stage IN ('target','research') AND NEW.stage NOT IN ('target','research') AND NEW.research_status <> 'done' THEN
      RAISE EXCEPTION 'Mark research as Done before leaving %', initcap(OLD.stage::text);
    END IF;
  END IF;
  IF NEW.stage IN ('proposal','negotiation') AND (NEW.stage IS DISTINCT FROM OLD.stage OR NEW.estimated_gross_fee IS DISTINCT FROM OLD.estimated_gross_fee)
     AND coalesce(NEW.estimated_gross_fee,0) <= 0 THEN
    RAISE EXCEPTION 'Proposal and Negotiation need an estimated gross fee above zero';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'lost' AND NEW.lost_reason IS NULL THEN RAISE EXCEPTION 'Lost reason required'; END IF;
    IF NEW.status = 'on_hold' AND NEW.on_hold_revisit_date IS NULL THEN RAISE EXCEPTION 'Revisit date required'; END IF;
    IF NEW.status = 'disqualified' AND nullif(trim(NEW.lost_note),'') IS NULL THEN RAISE EXCEPTION 'A disqualification reason is required'; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS opportunities_guard ON public.opportunities;
CREATE TRIGGER opportunities_guard BEFORE UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION public.opportunities_guard();

CREATE OR REPLACE FUNCTION public.move_opportunity_stage(_opportunity_id uuid, _stage opportunity_stage, _probability integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid := public.current_partner_id(); o public.opportunities%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.can_edit_opportunity(_opportunity_id) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF _probability < 0 OR _probability > 100 THEN RAISE EXCEPTION 'Probability must be 0-100'; END IF;
  IF _stage = 'converted' THEN RAISE EXCEPTION 'Use the conversion flow'; END IF;
  IF _stage IN ('enquiry','meeting_discovery') THEN RAISE EXCEPTION 'This stage is no longer used'; END IF;
  SELECT * INTO o FROM public.opportunities WHERE id = _opportunity_id AND status = 'open';
  IF o.id IS NULL THEN RAISE EXCEPTION 'Open opportunity not found'; END IF;
  IF o.stage IN ('target','research') AND _stage NOT IN ('target','research') AND o.research_status <> 'done' THEN
    RAISE EXCEPTION 'Mark research as Done before moving to %', initcap(replace(_stage::text,'_',' '));
  END IF;
  IF _stage IN ('proposal','negotiation') AND coalesce(o.estimated_gross_fee, 0) <= 0 THEN
    RAISE EXCEPTION 'Enter an estimated fee before moving to %', initcap(_stage::text);
  END IF;
  PERFORM set_config('aom.approved_change', 'on', true);
  UPDATE public.opportunities SET stage = _stage, probability = _probability,
    stage_changed_at = CASE WHEN o.stage <> _stage THEN now() ELSE stage_changed_at END,
    last_activity_date = current_date WHERE id = _opportunity_id;
  PERFORM set_config('aom.approved_change', '', true);
  INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
  VALUES (o.organisation_id, _opportunity_id, v_actor, 'stage_changed',
    initcap(replace(o.stage::text,'_',' ')) || ' → ' || initcap(replace(_stage::text,'_',' ')) || ' (' || _probability || '%)');
END $function$;

CREATE OR REPLACE FUNCTION public.set_opportunity_probability(_opportunity_id uuid, _probability integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid := public.current_partner_id(); v_org uuid; v_old integer;
BEGIN
  IF v_actor IS NULL OR NOT public.can_edit_opportunity(_opportunity_id) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF _probability IS NULL OR _probability < 0 OR _probability > 100 THEN RAISE EXCEPTION 'Probability must be 0-100'; END IF;
  SELECT organisation_id, probability INTO v_org, v_old FROM public.opportunities WHERE id = _opportunity_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Opportunity not found'; END IF;
  PERFORM set_config('aom.approved_change', 'on', true);
  UPDATE public.opportunities SET probability = _probability WHERE id = _opportunity_id;
  PERFORM set_config('aom.approved_change', '', true);
  INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
  VALUES (v_org, _opportunity_id, v_actor, 'probability_changed', 'Probability ' || v_old || '% → ' || _probability || '%');
END $function$;
REVOKE ALL ON FUNCTION public.set_opportunity_probability(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_opportunity_probability(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_opportunity_status(_opportunity_id uuid, _action text, _revisit_date date DEFAULT NULL::date, _lost_reason lost_reason DEFAULT NULL::lost_reason, _note text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid := public.current_partner_id(); v_org uuid; v_detail text;
BEGIN
  IF v_actor IS NULL OR NOT public.can_edit_opportunity(_opportunity_id) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  SELECT organisation_id INTO v_org FROM public.opportunities WHERE id = _opportunity_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Opportunity not found'; END IF;
  PERFORM set_config('aom.approved_change', 'on', true);
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
  PERFORM set_config('aom.approved_change', '', true);
  INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
  VALUES (v_org, _opportunity_id, v_actor, 'status_' || _action, v_detail);
END; $function$;

CREATE OR REPLACE FUNCTION public.update_enquiry_stage(_opportunity_id uuid, _action text, _reason text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid := public.current_partner_id(); v_org uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.can_edit_opportunity(_opportunity_id) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  SELECT organisation_id INTO v_org FROM public.opportunities WHERE id = _opportunity_id AND stage IN ('outreach','enquiry');
  IF v_org IS NULL THEN RAISE EXCEPTION 'Enquiry not found'; END IF;
  PERFORM set_config('aom.approved_change', 'on', true);
  IF _action = 'qualify' THEN
    UPDATE public.opportunities SET stage = 'qualified_lead', probability = 40, stage_changed_at = now(), last_activity_date = current_date WHERE id = _opportunity_id;
    INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
    VALUES (v_org, _opportunity_id, v_actor, 'enquiry_qualified', 'Outreach → Qualified Lead (40%)');
  ELSIF _action = 'disqualify' THEN
    IF nullif(trim(_reason), '') IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;
    UPDATE public.opportunities SET status = 'disqualified', lost_note = trim(_reason), last_activity_date = current_date WHERE id = _opportunity_id;
    INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
    VALUES (v_org, _opportunity_id, v_actor, 'enquiry_disqualified', trim(_reason));
  ELSE RAISE EXCEPTION 'Invalid action'; END IF;
  PERFORM set_config('aom.approved_change', '', true);
END $function$;

DROP FUNCTION IF EXISTS public.log_interaction(uuid, interaction_type, timestamp with time zone, text, date, uuid, integer, uuid[], uuid[], text, text, text, text, text, text, text, date, text);

CREATE FUNCTION public.log_interaction(_organisation_id uuid, _type interaction_type, _meeting_date timestamp with time zone, _next_step text, _next_step_date date, _opportunity_id uuid DEFAULT NULL::uuid, _duration_minutes integer DEFAULT NULL::integer, _contact_ids uuid[] DEFAULT '{}'::uuid[], _partner_ids uuid[] DEFAULT '{}'::uuid[], _summary text DEFAULT NULL::text, _agenda text DEFAULT NULL::text, _requirements text DEFAULT NULL::text, _commitments text DEFAULT NULL::text, _objections text DEFAULT NULL::text, _decisions text DEFAULT NULL::text, _outcome text DEFAULT NULL::text, _outcome_date date DEFAULT NULL::date, _outcome_reason text DEFAULT NULL::text, _first_meeting boolean DEFAULT false, _estimated_gross_fee numeric DEFAULT NULL::numeric, _estimated_expenses numeric DEFAULT NULL::numeric)
 RETURNS TABLE(meeting_id uuid, suggest_discovery boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid := public.current_partner_id(); v_org uuid := _organisation_id;
  v_meeting uuid; v_stage opportunity_stage; v_research research_status; v_fee numeric; v_pid uuid; v_outcome_detail text; v_promoted boolean := false;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF nullif(trim(_next_step),'') IS NULL OR _next_step_date IS NULL THEN RAISE EXCEPTION 'Next step and date are required'; END IF;
  IF _duration_minutes IS NOT NULL AND (_duration_minutes < 0 OR _duration_minutes > 1440) THEN RAISE EXCEPTION 'Invalid duration'; END IF;
  IF _opportunity_id IS NOT NULL THEN
    IF NOT public.can_access_opportunity(_opportunity_id) THEN RAISE EXCEPTION 'Not permitted'; END IF;
    SELECT organisation_id, stage, research_status, estimated_gross_fee INTO v_org, v_stage, v_research, v_fee FROM public.opportunities WHERE id = _opportunity_id;
  END IF;
  IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.organisations WHERE id = v_org) THEN RAISE EXCEPTION 'Organisation not found'; END IF;

  IF _opportunity_id IS NOT NULL AND _type = 'meeting' AND coalesce(_first_meeting,false) AND v_stage IN ('target','research','outreach') THEN
    IF NOT public.can_edit_opportunity(_opportunity_id) THEN RAISE EXCEPTION 'Not permitted'; END IF;
    IF v_stage IN ('target','research') AND v_research <> 'done' THEN RAISE EXCEPTION 'Mark research as Done before logging the first meeting'; END IF;
    v_promoted := true;
  END IF;

  IF _opportunity_id IS NOT NULL AND _type = 'meeting' AND (v_stage = 'first_meeting' OR v_promoted) THEN
    IF _outcome IS NULL OR _outcome NOT IN ('proposal_now','meet_again','later','not_lead') THEN RAISE EXCEPTION 'Choose the first meeting outcome'; END IF;
    IF _outcome IN ('proposal_now','meet_again','later') AND _outcome_date IS NULL THEN RAISE EXCEPTION 'A date is required for this outcome'; END IF;
    IF _outcome = 'not_lead' AND nullif(trim(_outcome_reason),'') IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;
    IF _outcome = 'proposal_now' AND coalesce(_estimated_gross_fee, v_fee, 0) <= 0 THEN RAISE EXCEPTION 'Enter the estimated gross fee to move to Proposal'; END IF;
    IF _estimated_gross_fee IS NOT NULL AND _estimated_gross_fee < 0 OR _estimated_expenses IS NOT NULL AND _estimated_expenses < 0 THEN RAISE EXCEPTION 'Amounts cannot be negative'; END IF;
  ELSE
    _outcome := NULL;
  END IF;

  INSERT INTO public.meetings (opportunity_id, organisation_id, type, meeting_date, duration_minutes, agenda, summary,
    requirements_identified, commitments, objections, decisions, next_step, next_step_date, outcome, created_by)
  VALUES (_opportunity_id, v_org, _type, coalesce(_meeting_date, now()), _duration_minutes, nullif(trim(_agenda),''), nullif(trim(_summary),''),
    nullif(trim(_requirements),''), nullif(trim(_commitments),''), nullif(trim(_objections),''), nullif(trim(_decisions),''),
    trim(_next_step), _next_step_date, _outcome, v_actor)
  RETURNING id INTO v_meeting;

  INSERT INTO public.meeting_contacts (meeting_id, contact_id)
  SELECT v_meeting, c.id FROM public.contacts c WHERE c.id = ANY(coalesce(_contact_ids,'{}')) AND c.organisation_id = v_org;
  INSERT INTO public.meeting_partners (meeting_id, partner_id)
  SELECT v_meeting, p.id FROM public.partners p WHERE p.id = ANY(coalesce(_partner_ids,'{}')) AND p.active;

  IF _outcome IS DISTINCT FROM 'proposal_now' THEN
    INSERT INTO public.tasks (opportunity_id, organisation_id, meeting_id, title, owner_partner_id, due_date, priority, status, source, created_by)
    VALUES (_opportunity_id, v_org, v_meeting, trim(_next_step), v_actor, _next_step_date, 'medium', 'open', 'from_meeting', v_actor);
  END IF;

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

    PERFORM set_config('aom.approved_change', 'on', true);
    IF v_promoted THEN
      UPDATE public.opportunities SET stage = 'first_meeting', probability = 25, stage_changed_at = now() WHERE id = _opportunity_id;
      INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
      VALUES (v_org, _opportunity_id, v_actor, 'stage_changed', initcap(v_stage::text) || ' → First Meeting (25%) · first meeting logged');
    END IF;

    IF _outcome = 'proposal_now' THEN
      UPDATE public.opportunities SET
        estimated_gross_fee = coalesce(_estimated_gross_fee, estimated_gross_fee),
        estimated_expenses = coalesce(_estimated_expenses, estimated_expenses),
        stage = 'proposal', probability = 50, stage_changed_at = now(), next_action = 'Send proposal', next_action_date = _outcome_date
      WHERE id = _opportunity_id;
      INSERT INTO public.tasks (opportunity_id, organisation_id, meeting_id, title, description, owner_partner_id, due_date, priority, status, source, created_by)
      VALUES (_opportunity_id, v_org, v_meeting, 'Send proposal', trim(_next_step), v_actor, _outcome_date, 'high', 'open', 'from_meeting', v_actor);
      v_outcome_detail := 'Lead - proposal now → Proposal (50%)' || coalesce(' · fee ' || _estimated_gross_fee, '');
    ELSIF _outcome = 'meet_again' THEN
      UPDATE public.opportunities SET stage = 'qualified_lead', probability = 40, stage_changed_at = now(), next_action = 'Next meeting', next_action_date = _outcome_date WHERE id = _opportunity_id;
      INSERT INTO public.tasks (opportunity_id, organisation_id, meeting_id, title, owner_partner_id, due_date, priority, status, source, created_by)
      VALUES (_opportunity_id, v_org, v_meeting, 'Next meeting', v_actor, _outcome_date, 'medium', 'open', 'from_meeting', v_actor);
      v_outcome_detail := 'Lead - meet again → Qualified Lead (40%)';
    ELSIF _outcome = 'later' THEN
      UPDATE public.opportunities SET status = 'on_hold', on_hold_revisit_date = _outcome_date WHERE id = _opportunity_id;
      v_outcome_detail := 'Lead - later → On hold until ' || _outcome_date;
    ELSIF _outcome = 'not_lead' THEN
      UPDATE public.opportunities SET status = 'disqualified', lost_note = trim(_outcome_reason) WHERE id = _opportunity_id;
      v_outcome_detail := 'Not a lead → Disqualified: ' || trim(_outcome_reason);
    END IF;
    PERFORM set_config('aom.approved_change', '', true);
  END IF;

  INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
  VALUES (v_org, _opportunity_id, v_actor, 'interaction_logged',
    initcap(_type::text) || ' logged' || coalesce(': ' || left(nullif(trim(_summary),''), 140), '') || ' · Next: ' || trim(_next_step));
  IF v_outcome_detail IS NOT NULL THEN
    INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
    VALUES (v_org, _opportunity_id, v_actor, 'first_meeting_outcome', 'First meeting outcome: ' || v_outcome_detail);
  END IF;

  RETURN QUERY SELECT v_meeting, (_type = 'meeting' AND NOT v_promoted AND v_stage IN ('target','research','outreach'));
END $function$;
REVOKE ALL ON FUNCTION public.log_interaction(uuid, interaction_type, timestamp with time zone, text, date, uuid, integer, uuid[], uuid[], text, text, text, text, text, text, text, date, text, boolean, numeric, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_interaction(uuid, interaction_type, timestamp with time zone, text, date, uuid, integer, uuid[], uuid[], text, text, text, text, text, text, text, date, text, boolean, numeric, numeric) TO authenticated;