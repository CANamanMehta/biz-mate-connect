CREATE TABLE public.sharing_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sharing_templates TO authenticated;
GRANT ALL ON public.sharing_templates TO service_role;
ALTER TABLE public.sharing_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY sharing_templates_read ON public.sharing_templates FOR SELECT TO authenticated USING (public.is_active_partner());
CREATE POLICY sharing_templates_admin_insert ON public.sharing_templates FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY sharing_templates_admin_update ON public.sharing_templates FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY sharing_templates_admin_delete ON public.sharing_templates FOR DELETE TO authenticated USING (public.is_admin());
CREATE TRIGGER sharing_templates_updated_at BEFORE UPDATE ON public.sharing_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.sharing_templates (code, name, description, rows, sort_order) VALUES
('T1','T1 Branch-executed, billed by AOM','Branch bears all execution costs from its 70%.',
 '[{"who":"firm_mp","component":"firm_base","base":"gross","share_pct":30},{"who":"branch","component":"execution","base":"gross","share_pct":70,"note":"Branch bears all execution costs from its 70%"}]',1),
('T2','T2 HO-executed, MP-acquired','Firm/MP base 25%, MP acquisition 25%, executing partner(s) 50% — all of net.',
 '[{"who":"firm_mp","component":"firm_base","base":"net","share_pct":25},{"who":"firm_mp","component":"referral_acquisition","base":"net","share_pct":25},{"who":"executing_partners","component":"execution","base":"net","share_pct":50}]',2),
('T3','T3 HO-executed, partner self-acquired','Firm/MP base 25%, acquiring partner 25%, executing partner(s) 50% — all of net.',
 '[{"who":"firm_mp","component":"firm_base","base":"net","share_pct":25},{"who":"acquiring_partner","component":"referral_acquisition","base":"net","share_pct":25},{"who":"executing_partners","component":"execution","base":"net","share_pct":50}]',3),
('T4','T4 HO-executed, client in branch city','Branch profit share 10% of net (editable 10–15%), Firm/MP 25%, executing partner(s) 65%. Add a referral row manually if applicable.',
 '[{"who":"branch","component":"branch_profit_share","base":"net","share_pct":10,"note":"Editable 10–15%"},{"who":"firm_mp","component":"firm_base","base":"net","share_pct":25},{"who":"executing_partners","component":"execution","base":"net","share_pct":65}]',4),
('T5','T5 Split HO + Branch','Two rows (HO, Branch) — enter base and % as agreed.',
 '[{"who":"ho","component":"execution","base":"net","share_pct":0},{"who":"branch","component":"execution","base":"net","share_pct":0}]',5),
('T6','T6 Custom / collaboration','No rows — add them yourself. Example: MP ⅓, Partner A ⅓, Partner B ⅓ of net.','[]',6);

ALTER TABLE public.revenue_allocations ALTER COLUMN computed_amount SET DEFAULT 0;

CREATE OR REPLACE FUNCTION public.compute_allocation_amount()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g numeric; n numeric;
BEGIN
  SELECT estimated_gross_fee, COALESCE(estimated_net_profit, estimated_gross_fee - estimated_expenses) INTO g, n
  FROM public.opportunities WHERE id = NEW.opportunity_id;
  NEW.computed_amount := ROUND(COALESCE(CASE WHEN NEW.base = 'gross' THEN g ELSE n END, 0) * NEW.share_pct / 100, 2);
  RETURN NEW;
END $$;
CREATE TRIGGER revenue_allocations_compute BEFORE INSERT OR UPDATE ON public.revenue_allocations FOR EACH ROW EXECUTE FUNCTION public.compute_allocation_amount();

CREATE OR REPLACE FUNCTION public.recompute_opportunity_allocations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.revenue_allocations SET share_pct = share_pct WHERE opportunity_id = NEW.id;
  RETURN NEW;
END $$;
CREATE TRIGGER opportunities_recompute_allocations AFTER UPDATE OF estimated_gross_fee, estimated_expenses ON public.opportunities FOR EACH ROW EXECUTE FUNCTION public.recompute_opportunity_allocations();
REVOKE ALL ON FUNCTION public.compute_allocation_amount() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recompute_opportunity_allocations() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS allocations_creator_update ON public.revenue_allocations;
DROP POLICY IF EXISTS allocations_creator_delete ON public.revenue_allocations;
CREATE POLICY allocations_editor_update ON public.revenue_allocations FOR UPDATE TO authenticated USING (public.can_edit_opportunity(opportunity_id)) WITH CHECK (public.can_edit_opportunity(opportunity_id));
CREATE POLICY allocations_editor_delete ON public.revenue_allocations FOR DELETE TO authenticated USING (public.can_edit_opportunity(opportunity_id));

CREATE OR REPLACE FUNCTION public.apply_sharing_template(_opportunity_id uuid, _template_name text, _rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := public.current_partner_id(); org uuid; r jsonb;
BEGIN
  IF NOT public.can_edit_opportunity(_opportunity_id) THEN RAISE EXCEPTION 'Not allowed to edit this opportunity'; END IF;
  SELECT organisation_id INTO org FROM public.opportunities WHERE id = _opportunity_id;
  DELETE FROM public.revenue_allocations WHERE opportunity_id = _opportunity_id;
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(_rows, '[]'::jsonb)) LOOP
    INSERT INTO public.revenue_allocations (opportunity_id, beneficiary_type, beneficiary_partner_id, beneficiary_branch, component, base, share_pct, note, created_by)
    VALUES (_opportunity_id, (r->>'beneficiary_type')::beneficiary_type, NULLIF(r->>'beneficiary_partner_id','')::uuid, NULLIF(r->>'beneficiary_branch',''),
            (r->>'component')::allocation_component, (r->>'base')::allocation_base, COALESCE((r->>'share_pct')::numeric, 0), NULLIF(r->>'note',''), me);
  END LOOP;
  UPDATE public.opportunities SET sharing_template = _template_name WHERE id = _opportunity_id;
  INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
  VALUES (org, _opportunity_id, me, 'revenue_split_template', 'Applied template ' || _template_name);
END $$;
REVOKE ALL ON FUNCTION public.apply_sharing_template(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_sharing_template(uuid, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_relationship_owner_from_opportunity(_opportunity_id uuid, _type relationship_owner_type, _partner_id uuid DEFAULT NULL, _branch text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE org uuid;
BEGIN
  IF NOT public.can_edit_opportunity(_opportunity_id) THEN RAISE EXCEPTION 'Not allowed to edit this opportunity'; END IF;
  SELECT organisation_id INTO org FROM public.opportunities WHERE id = _opportunity_id;
  UPDATE public.organisations SET relationship_owner_type = _type,
    relationship_owner_partner_id = CASE WHEN _type = 'partner' THEN _partner_id END,
    relationship_owner_branch = CASE WHEN _type = 'branch' THEN _branch WHEN _type = 'ho' THEN 'Jaipur-HO' END
  WHERE id = org;
  INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
  VALUES (org, _opportunity_id, public.current_partner_id(), 'relationship_owner_changed', 'Relationship owner set to ' || _type::text);
END $$;
REVOKE ALL ON FUNCTION public.set_relationship_owner_from_opportunity(uuid, relationship_owner_type, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_relationship_owner_from_opportunity(uuid, relationship_owner_type, uuid, text) TO authenticated;