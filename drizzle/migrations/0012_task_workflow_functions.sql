CREATE OR REPLACE FUNCTION public.complete_task(_task_id uuid, _next_title text DEFAULT NULL, _next_due date DEFAULT NULL)
RETURNS TABLE(opportunity_id uuid, recurring_task_id uuid, next_task_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_actor uuid := public.current_partner_id(); t public.tasks%ROWTYPE; v_rec uuid; v_next uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO t FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Task not found'; END IF;
  IF t.opportunity_id IS NOT NULL AND NOT public.can_access_opportunity(t.opportunity_id) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF t.status <> 'open' THEN RAISE EXCEPTION 'Task is not open'; END IF;
  UPDATE public.tasks SET status = 'done', completed_at = now() WHERE id = _task_id;

  IF t.is_recurring AND coalesce(t.recurrence_days, 0) > 0 THEN
    INSERT INTO public.tasks (opportunity_id, organisation_id, title, owner_partner_id, due_date, priority, status, is_recurring, recurrence_days, source, created_by)
    VALUES (t.opportunity_id, t.organisation_id, t.title, t.owner_partner_id, t.due_date + t.recurrence_days, t.priority, 'open', true, t.recurrence_days, t.source, v_actor)
    RETURNING id INTO v_rec;
  END IF;

  IF nullif(trim(_next_title), '') IS NOT NULL THEN
    INSERT INTO public.tasks (opportunity_id, organisation_id, title, owner_partner_id, due_date, priority, status, source, created_by)
    VALUES (t.opportunity_id, t.organisation_id, trim(_next_title), t.owner_partner_id, coalesce(_next_due, current_date + 3), 'medium', 'open', 'manual', v_actor)
    RETURNING id INTO v_next;
  END IF;

  IF t.opportunity_id IS NOT NULL THEN
    UPDATE public.opportunities SET last_activity_date = current_date,
      next_action = CASE WHEN v_next IS NOT NULL THEN trim(_next_title) ELSE next_action END,
      next_action_date = CASE WHEN v_next IS NOT NULL THEN coalesce(_next_due, current_date + 3) ELSE next_action_date END
    WHERE id = t.opportunity_id;
  END IF;

  IF coalesce(t.organisation_id, (SELECT o.organisation_id FROM public.opportunities o WHERE o.id = t.opportunity_id)) IS NOT NULL THEN
    INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
    VALUES (coalesce(t.organisation_id, (SELECT o.organisation_id FROM public.opportunities o WHERE o.id = t.opportunity_id)), t.opportunity_id, v_actor, 'task_completed',
      'Completed: ' || t.title || coalesce(' · Next: ' || nullif(trim(_next_title), ''), ''));
  END IF;
  RETURN QUERY SELECT t.opportunity_id, v_rec, v_next;
END $$;

CREATE OR REPLACE FUNCTION public.update_task(_task_id uuid, _due_date date DEFAULT NULL, _owner_partner_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_actor uuid := public.current_partner_id(); t public.tasks%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO t FROM public.tasks WHERE id = _task_id;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Task not found'; END IF;
  IF t.opportunity_id IS NOT NULL AND NOT public.can_access_opportunity(t.opportunity_id) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF _owner_partner_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.partners WHERE id = _owner_partner_id AND active) THEN RAISE EXCEPTION 'Select an active partner'; END IF;
  UPDATE public.tasks SET due_date = coalesce(_due_date, due_date), owner_partner_id = coalesce(_owner_partner_id, owner_partner_id) WHERE id = _task_id;
END $$;

CREATE OR REPLACE FUNCTION public.add_task(_title text, _due_date date, _opportunity_id uuid DEFAULT NULL, _owner_partner_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_actor uuid := public.current_partner_id(); v_org uuid; v_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF nullif(trim(_title), '') IS NULL OR _due_date IS NULL THEN RAISE EXCEPTION 'Title and due date are required'; END IF;
  IF _opportunity_id IS NOT NULL THEN
    IF NOT public.can_access_opportunity(_opportunity_id) THEN RAISE EXCEPTION 'Not permitted'; END IF;
    SELECT organisation_id INTO v_org FROM public.opportunities WHERE id = _opportunity_id;
  END IF;
  INSERT INTO public.tasks (opportunity_id, organisation_id, title, owner_partner_id, due_date, priority, status, source, created_by)
  VALUES (_opportunity_id, v_org, left(trim(_title), 300), coalesce(_owner_partner_id, v_actor), _due_date, 'medium', 'open', 'manual', v_actor)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.complete_task(uuid, text, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_task(uuid, date, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_task(text, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_task(uuid, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_task(uuid, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_task(text, date, uuid, uuid) TO authenticated;