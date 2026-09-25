CREATE TYPE public.cross_sell_status AS ENUM ('suggested','pursued','dismissed');

CREATE TABLE public.cross_sell_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_service_line_id uuid NOT NULL REFERENCES public.service_lines(id) ON DELETE CASCADE,
  to_service_line_id uuid NOT NULL REFERENCES public.service_lines(id) ON DELETE CASCADE,
  reason text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_service_line_id, to_service_line_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cross_sell_rules TO authenticated;
GRANT ALL ON public.cross_sell_rules TO service_role;
ALTER TABLE public.cross_sell_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Partners read rules" ON public.cross_sell_rules FOR SELECT TO authenticated USING (public.is_active_partner());
CREATE POLICY "Admins insert rules" ON public.cross_sell_rules FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admins update rules" ON public.cross_sell_rules FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins delete rules" ON public.cross_sell_rules FOR DELETE TO authenticated USING (public.is_admin());
CREATE TRIGGER set_cross_sell_rules_updated_at BEFORE UPDATE ON public.cross_sell_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.cross_sell_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  service_line_id uuid NOT NULL REFERENCES public.service_lines(id) ON DELETE CASCADE,
  reason text,
  status public.cross_sell_status NOT NULL DEFAULT 'suggested',
  dismissed_reason text,
  dismissed_at timestamptz,
  dismissed_by uuid REFERENCES public.partners(id),
  pursued_by uuid REFERENCES public.partners(id),
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cross_sell_one_open ON public.cross_sell_suggestions (organisation_id, service_line_id) WHERE status = 'suggested';
GRANT SELECT ON public.cross_sell_suggestions TO authenticated;
GRANT ALL ON public.cross_sell_suggestions TO service_role;
ALTER TABLE public.cross_sell_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Partners read suggestions" ON public.cross_sell_suggestions FOR SELECT TO authenticated USING (public.is_active_partner());
CREATE TRIGGER set_cross_sell_suggestions_updated_at BEFORE UPDATE ON public.cross_sell_suggestions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.generate_cross_sell_for_org(_organisation_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  INSERT INTO public.cross_sell_suggestions (organisation_id, service_line_id, reason)
  SELECT DISTINCT ON (r.to_service_line_id) _organisation_id, r.to_service_line_id,
    coalesce(nullif(r.reason,''), 'Engaged for ' || sf.name || ' — often needs ' || st.name)
  FROM public.organisation_services os
  JOIN public.cross_sell_rules r ON r.from_service_line_id = os.service_line_id AND r.active
  JOIN public.service_lines sf ON sf.id = r.from_service_line_id
  JOIN public.service_lines st ON st.id = r.to_service_line_id AND st.active
  WHERE os.organisation_id = _organisation_id AND os.status = 'engaged'
    AND NOT EXISTS (SELECT 1 FROM public.organisation_services x WHERE x.organisation_id = _organisation_id AND x.service_line_id = r.to_service_line_id AND x.status IN ('engaged','pitched','not_relevant'))
    AND NOT EXISTS (SELECT 1 FROM public.cross_sell_suggestions s WHERE s.organisation_id = _organisation_id AND s.service_line_id = r.to_service_line_id
      AND (s.status = 'suggested' OR (s.status = 'dismissed' AND coalesce(s.dismissed_at, s.updated_at) > now() - interval '180 days')))
  ORDER BY r.to_service_line_id, r.created_at
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.generate_cross_sell_for_org(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.generate_cross_sell_all()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE total integer := 0; o record;
BEGIN
  FOR o IN SELECT id FROM public.organisations WHERE status = 'client' OR id IN (SELECT organisation_id FROM public.organisation_services WHERE status='engaged') LOOP
    total := total + public.generate_cross_sell_for_org(o.id);
  END LOOP;
  RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.generate_cross_sell_all() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.organisation_services_cross_sell()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'engaged' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'engaged') THEN
    PERFORM public.generate_cross_sell_for_org(NEW.organisation_id);
  END IF;
  IF NEW.status IN ('engaged','pitched','not_relevant') THEN
    UPDATE public.cross_sell_suggestions SET status = 'dismissed', dismissed_reason = coalesce(dismissed_reason, 'Service now ' || NEW.status::text), dismissed_at = now()
    WHERE organisation_id = NEW.organisation_id AND service_line_id = NEW.service_line_id AND status = 'suggested' AND NEW.status <> 'pitched';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER organisation_services_cross_sell AFTER INSERT OR UPDATE OF status ON public.organisation_services
FOR EACH ROW EXECUTE FUNCTION public.organisation_services_cross_sell();

CREATE OR REPLACE FUNCTION public.create_cross_sell_opportunity(_organisation_id uuid, _service_line_id uuid, _suggestion_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := public.current_partner_id(); v_opp uuid; v_org text; v_svc text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT name INTO v_org FROM public.organisations WHERE id = _organisation_id;
  SELECT name INTO v_svc FROM public.service_lines WHERE id = _service_line_id;
  IF v_org IS NULL OR v_svc IS NULL THEN RAISE EXCEPTION 'Organisation or service not found'; END IF;
  INSERT INTO public.opportunities (organisation_id, title, owner_partner_id, stage, status, probability, acquisition_source, acquired_by_partner_id, last_activity_date, created_by)
  VALUES (_organisation_id, v_org || ' — ' || v_svc, v_actor, 'qualified_lead', 'open', 30, 'existing_client', v_actor, current_date, v_actor)
  RETURNING id INTO v_opp;
  INSERT INTO public.opportunity_service_lines (opportunity_id, service_line_id, created_by) VALUES (v_opp, _service_line_id, v_actor);
  INSERT INTO public.organisation_services (organisation_id, service_line_id, status, created_by) VALUES (_organisation_id, _service_line_id, 'pitched', v_actor)
  ON CONFLICT (organisation_id, service_line_id) DO UPDATE SET status = 'pitched' WHERE public.organisation_services.status <> 'engaged';
  UPDATE public.cross_sell_suggestions SET status = 'pursued', pursued_by = v_actor, opportunity_id = v_opp
  WHERE status = 'suggested' AND organisation_id = _organisation_id AND service_line_id = _service_line_id
     OR (id = _suggestion_id AND status = 'suggested');
  INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
  VALUES (_organisation_id, v_opp, v_actor, 'cross_sell_pursued', 'Cross-sell opportunity created: ' || v_svc);
  RETURN v_opp;
END $$;

CREATE OR REPLACE FUNCTION public.dismiss_cross_sell(_suggestion_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := public.current_partner_id(); s public.cross_sell_suggestions%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF nullif(trim(_reason),'') IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;
  UPDATE public.cross_sell_suggestions SET status='dismissed', dismissed_reason=left(trim(_reason),300), dismissed_at=now(), dismissed_by=v_actor
  WHERE id=_suggestion_id AND status='suggested' RETURNING * INTO s;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Suggestion not found'; END IF;
  INSERT INTO public.activity_log (organisation_id, actor_partner_id, action, detail)
  VALUES (s.organisation_id, v_actor, 'cross_sell_dismissed', 'Dismissed cross-sell: ' || (SELECT name FROM public.service_lines WHERE id = s.service_line_id) || ' — ' || trim(_reason));
END $$;

CREATE OR REPLACE FUNCTION public.mark_service_not_relevant(_organisation_id uuid, _service_line_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := public.current_partner_id();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.organisation_services (organisation_id, service_line_id, status, created_by) VALUES (_organisation_id, _service_line_id, 'not_relevant', v_actor)
  ON CONFLICT (organisation_id, service_line_id) DO UPDATE SET status = 'not_relevant';
  INSERT INTO public.activity_log (organisation_id, actor_partner_id, action, detail)
  VALUES (_organisation_id, v_actor, 'service_not_relevant', (SELECT name FROM public.service_lines WHERE id=_service_line_id) || ' marked not relevant');
END $$;

CREATE OR REPLACE FUNCTION public.cross_sell_report()
RETURNS TABLE(partner_id uuid, partner_name text, created bigint, pursued bigint, converted bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name,
    count(s.id) FILTER (WHERE o.relationship_owner_partner_id = p.id),
    count(s.id) FILTER (WHERE s.pursued_by = p.id),
    count(s.id) FILTER (WHERE s.pursued_by = p.id AND opp.stage = 'converted')
  FROM public.partners p
  LEFT JOIN public.cross_sell_suggestions s ON true
  LEFT JOIN public.organisations o ON o.id = s.organisation_id
  LEFT JOIN public.opportunities opp ON opp.id = s.opportunity_id
  WHERE public.is_active_partner() AND p.active
  GROUP BY p.id, p.name
  ORDER BY p.name
$$;

REVOKE ALL ON FUNCTION public.create_cross_sell_opportunity(uuid, uuid, uuid), public.dismiss_cross_sell(uuid, text), public.mark_service_not_relevant(uuid, uuid), public.cross_sell_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_cross_sell_opportunity(uuid, uuid, uuid), public.dismiss_cross_sell(uuid, text), public.mark_service_not_relevant(uuid, uuid), public.cross_sell_report() TO authenticated;