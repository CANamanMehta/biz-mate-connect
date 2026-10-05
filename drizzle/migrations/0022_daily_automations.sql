ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS escalated boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.run_daily_automations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cfg jsonb := '{"stale_tasks":true,"escalation":true,"onhold_revisit":true,"escalation_days":3,"escalation_partner_id":null}'::jsonb;
  _thr jsonb := '{"default_days":14,"late_stage_days":10,"warning_days":3,"early_stage_days":21}'::jsonb;
  _today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  _esc_partner uuid;
  _esc_days int;
  _stale int := 0; _escalated int := 0; _revisit int := 0;
  r record;
BEGIN
  SELECT _cfg || COALESCE(value, '{}'::jsonb) INTO _cfg FROM app_settings WHERE key = 'automations';
  _cfg := COALESCE(_cfg, '{"stale_tasks":true,"escalation":true,"onhold_revisit":true,"escalation_days":3,"escalation_partner_id":null}'::jsonb);
  SELECT _thr || COALESCE(value, '{}'::jsonb) INTO _thr FROM app_settings WHERE key = 'pipeline_stale_thresholds';
  _thr := COALESCE(_thr, '{"default_days":14,"late_stage_days":10,"warning_days":3,"early_stage_days":21}'::jsonb);

  -- 1. Stale opportunities
  IF COALESCE((_cfg->>'stale_tasks')::boolean, true) THEN
    FOR r IN
      SELECT o.id, o.owner_partner_id, o.organisation_id, org.name AS org_name
      FROM opportunities o JOIN organisations org ON org.id = o.organisation_id
      WHERE o.status = 'open' AND o.stage <> 'converted'
        AND (_today - (COALESCE(o.last_activity_date::timestamptz, o.stage_changed_at) AT TIME ZONE 'Asia/Kolkata')::date) >
          CASE WHEN o.stage IN ('target','research') THEN (_thr->>'early_stage_days')::int
               WHEN o.stage IN ('proposal','negotiation') THEN (_thr->>'late_stage_days')::int
               ELSE (_thr->>'default_days')::int END
        AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.opportunity_id = o.id AND t.status = 'open')
    LOOP
      INSERT INTO tasks (title, opportunity_id, organisation_id, owner_partner_id, due_date, source)
      VALUES ('Stale - ' || r.org_name || ': still live? Log an update or park it.', r.id, r.organisation_id, r.owner_partner_id, _today, 'stale_alert');
      _stale := _stale + 1;
    END LOOP;
  END IF;

  -- 2. Escalation
  IF COALESCE((_cfg->>'escalation')::boolean, true) THEN
    _esc_days := COALESCE((_cfg->>'escalation_days')::int, 3);
    _esc_partner := NULLIF(_cfg->>'escalation_partner_id', '')::uuid;
    IF _esc_partner IS NULL THEN
      SELECT id INTO _esc_partner FROM partners WHERE is_managing_partner AND active ORDER BY created_at LIMIT 1;
    END IF;
    IF _esc_partner IS NOT NULL THEN
      FOR r IN
        SELECT t.id, t.title, t.opportunity_id, p.name AS owner_name,
               COALESCE(org1.name, org2.name) AS org_name
        FROM tasks t
        JOIN partners p ON p.id = t.owner_partner_id
        LEFT JOIN opportunities o ON o.id = t.opportunity_id
        LEFT JOIN organisations org1 ON org1.id = o.organisation_id
        LEFT JOIN organisations org2 ON org2.id = t.organisation_id
        WHERE t.status = 'open' AND NOT t.escalated AND t.due_date < _today - _esc_days
      LOOP
        INSERT INTO notifications (partner_id, type, message, link)
        VALUES (_esc_partner, 'task_escalation',
          r.owner_name || ' has an overdue task: ' || r.title || ' (' || COALESCE(r.org_name, 'no organisation') || ')',
          CASE WHEN r.opportunity_id IS NOT NULL THEN '/opportunities/' || r.opportunity_id ELSE '/tasks' END);
        UPDATE tasks SET escalated = true WHERE id = r.id;
        _escalated := _escalated + 1;
      END LOOP;
    END IF;
  END IF;

  -- 3. On-hold revisit
  IF COALESCE((_cfg->>'onhold_revisit')::boolean, true) THEN
    FOR r IN
      SELECT o.id, o.owner_partner_id, o.organisation_id, org.name AS org_name
      FROM opportunities o JOIN organisations org ON org.id = o.organisation_id
      WHERE o.status = 'on_hold' AND o.on_hold_revisit_date IS NOT NULL AND o.on_hold_revisit_date <= _today
        AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.opportunity_id = o.id AND t.status = 'open' AND t.title LIKE 'Revisit %')
    LOOP
      INSERT INTO tasks (title, opportunity_id, organisation_id, owner_partner_id, due_date, source)
      VALUES ('Revisit ' || r.org_name, r.id, r.organisation_id, r.owner_partner_id, _today, 'manual');
      INSERT INTO notifications (partner_id, type, message, link)
      VALUES (r.owner_partner_id, 'onhold_revisit', 'Time to revisit ' || r.org_name || ' (on hold)', '/opportunities/' || r.id);
      _revisit := _revisit + 1;
    END LOOP;
  END IF;

  INSERT INTO activity_log (action, detail)
  VALUES ('daily_automations_run',
    format('Stale tasks created: %s; tasks escalated: %s; revisit tasks created: %s', _stale, _escalated, _revisit));

  RETURN jsonb_build_object('stale_tasks', _stale, 'escalated', _escalated, 'revisit_tasks', _revisit);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_daily_automations() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.run_daily_automations_now()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can run the daily automations';
  END IF;
  RETURN public.run_daily_automations();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_daily_automations_now() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_daily_automations_now() TO authenticated;