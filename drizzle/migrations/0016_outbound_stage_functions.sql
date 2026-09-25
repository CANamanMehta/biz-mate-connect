COMMENT ON TYPE public.opportunity_stage IS 'enquiry and meeting_discovery are DEPRECATED: replaced by outreach and first_meeting';

-- Storage access for crm-documents
CREATE POLICY "crm docs read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'crm-documents' AND EXISTS (SELECT 1 FROM public.documents d WHERE d.file_path = storage.objects.name));
CREATE POLICY "crm docs upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'crm-documents' AND public.is_active_partner()
    AND lower(storage.extension(name)) IN ('pdf','docx','xlsx','pptx'));
CREATE POLICY "crm docs delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'crm-documents' AND (owner = auth.uid() OR public.is_admin()));

-- Research task automation
CREATE OR REPLACE FUNCTION public.opportunity_research_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_org text; v_task uuid; v_due date;
BEGIN
  IF NEW.stage NOT IN ('target','research') OR NEW.status <> 'open' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.owner_partner_id IS NOT DISTINCT FROM NEW.owner_partner_id
     AND OLD.research_due_date IS NOT DISTINCT FROM NEW.research_due_date AND OLD.stage = NEW.stage THEN RETURN NEW; END IF;
  SELECT name INTO v_org FROM public.organisations WHERE id = NEW.organisation_id;
  v_due := coalesce(NEW.research_due_date, current_date + 7);
  SELECT id INTO v_task FROM public.tasks WHERE opportunity_id = NEW.id AND status = 'open' AND title LIKE 'Complete research on %' LIMIT 1;
  IF v_task IS NOT NULL THEN
    UPDATE public.tasks SET owner_partner_id = NEW.owner_partner_id, due_date = v_due WHERE id = v_task;
  ELSIF NEW.research_status <> 'done' THEN
    INSERT INTO public.tasks (opportunity_id, organisation_id, title, owner_partner_id, due_date, priority, status, source, created_by)
    VALUES (NEW.id, NEW.organisation_id, 'Complete research on ' || v_org, NEW.owner_partner_id, v_due, 'medium', 'open', 'manual', coalesce(public.current_partner_id(), NEW.created_by));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER opportunities_research_task AFTER INSERT OR UPDATE OF owner_partner_id, research_due_date, stage ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.opportunity_research_task();

-- New target
CREATE OR REPLACE FUNCTION public.create_target(_organisation_name text, _owner_partner_id uuid,
  _service_line_ids uuid[] DEFAULT '{}'::uuid[], _organisation_id uuid DEFAULT NULL, _research_due_date date DEFAULT NULL,
  _target_rationale text DEFAULT NULL, _industry text DEFAULT NULL, _city text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_actor uuid := public.current_partner_id(); v_org uuid := _organisation_id; v_opp uuid; v_name text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partners WHERE id = _owner_partner_id AND active) THEN RAISE EXCEPTION 'Select an active owner'; END IF;
  IF v_org IS NULL THEN
    IF nullif(trim(_organisation_name), '') IS NULL THEN RAISE EXCEPTION 'Organisation name is required'; END IF;
    INSERT INTO public.organisations (name, status, industry, city, relationship_owner_type, relationship_owner_partner_id, created_by)
    VALUES (trim(_organisation_name), 'prospect', nullif(trim(_industry), ''), nullif(trim(_city), ''), 'partner', _owner_partner_id, v_actor)
    RETURNING id INTO v_org;
  END IF;
  SELECT name INTO v_name FROM public.organisations WHERE id = v_org;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Organisation not found'; END IF;
  INSERT INTO public.opportunities (organisation_id, title, owner_partner_id, stage, status, probability, estimated_gross_fee,
    acquisition_source, acquired_by_partner_id, research_due_date, target_rationale, last_activity_date, created_by)
  VALUES (v_org, v_name || ' — Target', _owner_partner_id, 'target', 'open', 5, 0, 'outbound_research', _owner_partner_id,
    coalesce(_research_due_date, current_date + 7), nullif(trim(_target_rationale), ''), current_date, v_actor)
  RETURNING id INTO v_opp;
  INSERT INTO public.opportunity_service_lines (opportunity_id, service_line_id, created_by)
  SELECT v_opp, s, v_actor FROM unnest(coalesce(_service_line_ids, '{}')) s ON CONFLICT DO NOTHING;
  INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
  VALUES (v_org, v_opp, v_actor, 'target_created', 'New outbound target: ' || v_name);
  RETURN v_opp;
END $$;

-- Stage moves with research + fee gates
CREATE OR REPLACE FUNCTION public.move_opportunity_stage(_opportunity_id uuid, _stage opportunity_stage, _probability integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
  UPDATE public.opportunities SET stage = _stage, probability = _probability,
    stage_changed_at = CASE WHEN o.stage <> _stage THEN now() ELSE stage_changed_at END,
    last_activity_date = current_date WHERE id = _opportunity_id;
  INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
  VALUES (o.organisation_id, _opportunity_id, v_actor, 'stage_changed',
    initcap(replace(o.stage::text,'_',' ')) || ' → ' || initcap(replace(_stage::text,'_',' ')) || ' (' || _probability || '%)');
END $$;

-- Enquiries now start at Outreach
CREATE OR REPLACE FUNCTION public.update_enquiry_stage(_opportunity_id uuid, _action text, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_actor uuid := public.current_partner_id(); v_org uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.can_edit_opportunity(_opportunity_id) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  SELECT organisation_id INTO v_org FROM public.opportunities WHERE id = _opportunity_id AND stage IN ('outreach','enquiry');
  IF v_org IS NULL THEN RAISE EXCEPTION 'Enquiry not found'; END IF;
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
END $$;

-- create_enquiry at Outreach
DO $do$
DECLARE src text;
BEGIN
  SELECT pg_get_functiondef('public.create_enquiry'::regproc) INTO src;
  src := replace(src, '''enquiry'', ''open'', 10', '''outreach'', ''open'', 10');
  EXECUTE src;
  SELECT pg_get_functiondef('public.create_cross_sell_opportunity'::regproc) INTO src;
  src := replace(src, '''qualified_lead'', ''open'', 30', '''qualified_lead'', ''open'', 40');
  EXECUTE src;
END $do$;

-- Interaction logging with first-meeting outcome
DROP FUNCTION public.log_interaction(uuid, interaction_type, timestamptz, text, date, uuid, integer, uuid[], uuid[], text, text, text, text, text, text);
CREATE FUNCTION public.log_interaction(_organisation_id uuid, _type interaction_type, _meeting_date timestamptz, _next_step text, _next_step_date date,
  _opportunity_id uuid DEFAULT NULL, _duration_minutes integer DEFAULT NULL, _contact_ids uuid[] DEFAULT '{}', _partner_ids uuid[] DEFAULT '{}',
  _summary text DEFAULT NULL, _agenda text DEFAULT NULL, _requirements text DEFAULT NULL, _commitments text DEFAULT NULL,
  _objections text DEFAULT NULL, _decisions text DEFAULT NULL,
  _outcome text DEFAULT NULL, _outcome_date date DEFAULT NULL, _outcome_reason text DEFAULT NULL)
RETURNS TABLE(meeting_id uuid, suggest_discovery boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_actor uuid := public.current_partner_id(); v_org uuid := _organisation_id;
  v_meeting uuid; v_stage opportunity_stage; v_pid uuid; v_outcome_detail text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF nullif(trim(_next_step),'') IS NULL OR _next_step_date IS NULL THEN RAISE EXCEPTION 'Next step and date are required'; END IF;
  IF _duration_minutes IS NOT NULL AND (_duration_minutes < 0 OR _duration_minutes > 1440) THEN RAISE EXCEPTION 'Invalid duration'; END IF;
  IF _opportunity_id IS NOT NULL THEN
    IF NOT public.can_access_opportunity(_opportunity_id) THEN RAISE EXCEPTION 'Not permitted'; END IF;
    SELECT organisation_id, stage INTO v_org, v_stage FROM public.opportunities WHERE id = _opportunity_id;
  END IF;
  IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM public.organisations WHERE id = v_org) THEN RAISE EXCEPTION 'Organisation not found'; END IF;

  IF _opportunity_id IS NOT NULL AND _type = 'meeting' AND v_stage = 'first_meeting' THEN
    IF _outcome IS NULL OR _outcome NOT IN ('proposal_now','meet_again','later','not_lead') THEN RAISE EXCEPTION 'Choose the first meeting outcome'; END IF;
    IF _outcome IN ('proposal_now','meet_again','later') AND _outcome_date IS NULL THEN RAISE EXCEPTION 'A date is required for this outcome'; END IF;
    IF _outcome = 'not_lead' AND nullif(trim(_outcome_reason),'') IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;
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

    IF _outcome = 'proposal_now' THEN
      UPDATE public.opportunities SET stage = 'proposal', probability = 50, stage_changed_at = now(), next_action = 'Send proposal', next_action_date = _outcome_date WHERE id = _opportunity_id;
      INSERT INTO public.tasks (opportunity_id, organisation_id, meeting_id, title, owner_partner_id, due_date, priority, status, source, created_by)
      VALUES (_opportunity_id, v_org, v_meeting, 'Send proposal', v_actor, _outcome_date, 'high', 'open', 'from_meeting', v_actor);
      v_outcome_detail := 'Lead - proposal now → Proposal (50%)';
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
  END IF;

  INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
  VALUES (v_org, _opportunity_id, v_actor, 'interaction_logged',
    initcap(_type::text) || ' logged' || coalesce(': ' || left(nullif(trim(_summary),''), 140), '') || ' · Next: ' || trim(_next_step));
  IF v_outcome_detail IS NOT NULL THEN
    INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
    VALUES (v_org, _opportunity_id, v_actor, 'first_meeting_outcome', 'First meeting outcome: ' || v_outcome_detail);
  END IF;

  RETURN QUERY SELECT v_meeting, (_type = 'meeting' AND v_stage IN ('target','research','outreach'));
END $$;
GRANT EXECUTE ON FUNCTION public.log_interaction(uuid, interaction_type, timestamptz, text, date, uuid, integer, uuid[], uuid[], text, text, text, text, text, text, text, date, text) TO authenticated;