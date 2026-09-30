ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS conflict_check_note text,
  ADD COLUMN IF NOT EXISTS engagement_start_date date,
  ADD COLUMN IF NOT EXISTS is_recurring_engagement boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS renewal_of_opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.convert_opportunity(
  _opportunity_id uuid, _final_fee numeric, _final_expenses numeric, _start_date date,
  _service_line_ids uuid[], _recurring boolean, _conflict_confirmed boolean, _conflict_note text,
  _relationship_owner_partner_id uuid, _override_reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_actor uuid := public.current_partner_id(); o public.opportunities%ROWTYPE; v_renewal uuid; v_close date; s uuid; v_svc text; v_link text;
BEGIN
  IF v_actor IS NULL OR NOT public.can_edit_opportunity(_opportunity_id) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  SELECT * INTO o FROM public.opportunities WHERE id = _opportunity_id FOR UPDATE;
  IF o.id IS NULL OR o.status <> 'open' OR o.stage = 'converted' THEN RAISE EXCEPTION 'Open opportunity not found'; END IF;
  IF o.stage NOT IN ('proposal','negotiation') THEN
    IF NOT public.is_admin() OR nullif(trim(_override_reason),'') IS NULL THEN
      RAISE EXCEPTION 'Move the deal to Proposal or Negotiation before marking it won.';
    END IF;
  END IF;
  IF coalesce(_final_fee,0) <= 0 THEN RAISE EXCEPTION 'Final gross fee must be above zero'; END IF;
  IF coalesce(_final_expenses,0) < 0 THEN RAISE EXCEPTION 'Expenses cannot be negative'; END IF;
  IF _start_date IS NULL THEN RAISE EXCEPTION 'Engagement start date is required'; END IF;
  IF coalesce(array_length(_service_line_ids,1),0) = 0 THEN RAISE EXCEPTION 'Tick at least one service line won'; END IF;
  IF NOT coalesce(_conflict_confirmed,false) THEN RAISE EXCEPTION 'Confirm the conflict check'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.revenue_allocations WHERE opportunity_id = _opportunity_id) THEN RAISE EXCEPTION 'Add at least one revenue split row'; END IF;
  IF _relationship_owner_partner_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.partners WHERE id = _relationship_owner_partner_id AND active) THEN RAISE EXCEPTION 'Choose an active relationship owner'; END IF;
  v_link := '/opportunities/' || _opportunity_id || '/handover';

  IF nullif(trim(_override_reason),'') IS NOT NULL AND o.stage NOT IN ('proposal','negotiation') THEN
    INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
    VALUES (o.organisation_id, o.id, v_actor, 'conversion_override', 'Admin override from ' || initcap(replace(o.stage::text,'_',' ')) || ': ' || trim(_override_reason));
  END IF;

  PERFORM set_config('aom.approved_change', 'conversion', true);
  UPDATE public.opportunities SET stage = 'converted', probability = 100, stage_changed_at = now(),
    estimated_gross_fee = _final_fee, estimated_expenses = coalesce(_final_expenses,0),
    converted_at = now(), last_activity_date = current_date, engagement_start_date = _start_date,
    is_recurring_engagement = coalesce(_recurring,false),
    conflict_check_confirmed = true, conflict_check_by = v_actor, conflict_check_at = now(), conflict_check_note = nullif(trim(_conflict_note),'')
  WHERE id = o.id;
  PERFORM set_config('aom.approved_change', '', true);
  INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
  VALUES (o.organisation_id, o.id, v_actor, 'conflict_check', 'Conflict check confirmed' || coalesce(' — ' || nullif(trim(_conflict_note),''), '')),
         (o.organisation_id, o.id, v_actor, 'converted', 'Marked won → Converted (100%) · fee ' || _final_fee || ' · starts ' || _start_date);

  -- won services on the opportunity
  INSERT INTO public.opportunity_service_lines (opportunity_id, service_line_id, created_by)
  SELECT o.id, x, v_actor FROM unnest(_service_line_ids) x ON CONFLICT DO NOTHING;

  UPDATE public.organisations SET status = 'client', relationship_owner_type = 'partner', relationship_owner_partner_id = _relationship_owner_partner_id, relationship_owner_branch = NULL
  WHERE id = o.organisation_id;
  INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
  VALUES (o.organisation_id, o.id, v_actor, 'organisation_client', 'Organisation is now a Client · relationship owner ' || (SELECT name FROM public.partners WHERE id = _relationship_owner_partner_id));

  FOREACH s IN ARRAY _service_line_ids LOOP
    PERFORM public.set_organisation_service_status(o.organisation_id, s, 'engaged');
  END LOOP;

  IF coalesce(_recurring,false) THEN
    v_close := (_start_date + interval '11 months')::date;
    INSERT INTO public.opportunities (organisation_id, title, owner_partner_id, stage, status, probability, estimated_gross_fee, expected_close_date,
      acquisition_source, acquired_by_partner_id, execution_mode, last_activity_date, renewal_of_opportunity_id, research_status, created_by)
    VALUES (o.organisation_id, 'Renewal - ' || o.title, o.owner_partner_id, 'qualified_lead', 'open', 40, _final_fee, v_close,
      'existing_client', o.owner_partner_id, o.execution_mode, current_date, o.id, 'done', v_actor)
    RETURNING id INTO v_renewal;
    INSERT INTO public.opportunity_service_lines (opportunity_id, service_line_id, created_by)
    SELECT v_renewal, x, v_actor FROM unnest(_service_line_ids) x ON CONFLICT DO NOTHING;
    INSERT INTO public.tasks (opportunity_id, organisation_id, title, owner_partner_id, due_date, priority, status, source, created_by)
    VALUES (v_renewal, o.organisation_id, 'Start renewal discussion', o.owner_partner_id, (v_close - interval '1 month')::date, 'medium', 'open', 'conversion', v_actor);
    INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
    VALUES (o.organisation_id, o.id, v_actor, 'renewal_created', 'Renewal opportunity created at Qualified Lead, expected close ' || v_close);
  END IF;

  INSERT INTO public.notifications (partner_id, type, message, link, is_read)
  SELECT DISTINCT pid, 'opportunity_converted', 'Won: ' || o.title, v_link, false
  FROM (SELECT partner_id AS pid FROM public.opportunity_collaborators WHERE opportunity_id = o.id
        UNION SELECT _relationship_owner_partner_id UNION SELECT o.owner_partner_id) t
  WHERE pid IS NOT NULL AND pid <> v_actor;

  RETURN v_renewal;
END $$;

CREATE OR REPLACE FUNCTION public.undo_conversion(_opportunity_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_actor uuid := public.current_partner_id(); o public.opportunities%ROWTYPE; r record; v_note text := '';
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins can undo a conversion'; END IF;
  IF nullif(trim(_reason),'') IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;
  SELECT * INTO o FROM public.opportunities WHERE id = _opportunity_id FOR UPDATE;
  IF o.id IS NULL OR o.stage <> 'converted' THEN RAISE EXCEPTION 'Converted opportunity not found'; END IF;
  IF o.converted_at IS NULL OR o.converted_at < now() - interval '7 days' THEN RAISE EXCEPTION 'Conversions can only be undone within 7 days'; END IF;

  PERFORM set_config('aom.approved_change', 'on', true);
  UPDATE public.opportunities SET stage = 'negotiation', probability = 75, stage_changed_at = now(), converted_at = NULL, last_activity_date = current_date WHERE id = o.id;
  PERFORM set_config('aom.approved_change', '', true);

  IF NOT EXISTS (SELECT 1 FROM public.opportunities WHERE organisation_id = o.organisation_id AND stage = 'converted' AND id <> o.id) THEN
    UPDATE public.organisations SET status = 'prospect' WHERE id = o.organisation_id AND status = 'client';
    v_note := v_note || ' · organisation back to Prospect';
  END IF;

  FOR r IN SELECT id FROM public.opportunities x WHERE x.renewal_of_opportunity_id = o.id AND x.stage = 'qualified_lead' AND x.status = 'open'
    AND NOT EXISTS (SELECT 1 FROM public.meetings m WHERE m.opportunity_id = x.id)
    AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.opportunity_id = x.id)
    AND NOT EXISTS (SELECT 1 FROM public.activity_log a WHERE a.opportunity_id = x.id)
    AND NOT EXISTS (SELECT 1 FROM public.lead_costs c WHERE c.opportunity_id = x.id)
    AND NOT EXISTS (SELECT 1 FROM public.cross_sell_suggestions c WHERE c.opportunity_id = x.id)
    AND NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.opportunity_id = x.id AND (t.status <> 'open' OR t.source <> 'conversion'))
  LOOP
    DELETE FROM public.tasks WHERE opportunity_id = r.id;
    DELETE FROM public.opportunity_service_lines WHERE opportunity_id = r.id;
    DELETE FROM public.opportunity_collaborators WHERE opportunity_id = r.id;
    DELETE FROM public.revenue_allocations WHERE opportunity_id = r.id;
    DELETE FROM public.opportunities WHERE id = r.id;
    v_note := v_note || ' · untouched renewal removed';
  END LOOP;

  INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
  VALUES (o.organisation_id, o.id, v_actor, 'conversion_undone', 'Conversion undone → Negotiation (75%): ' || trim(_reason) || v_note);
END $$;

REVOKE ALL ON FUNCTION public.convert_opportunity(uuid, numeric, numeric, date, uuid[], boolean, boolean, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.undo_conversion(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_opportunity(uuid, numeric, numeric, date, uuid[], boolean, boolean, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_conversion(uuid, text) TO authenticated;