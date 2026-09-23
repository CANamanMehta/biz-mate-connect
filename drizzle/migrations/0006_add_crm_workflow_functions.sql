CREATE TYPE public.enquiry_urgency AS ENUM ('low', 'medium', 'high');

ALTER TABLE public.opportunities
  ADD COLUMN urgency public.enquiry_urgency NOT NULL DEFAULT 'medium';

CREATE INDEX idx_organisations_name_lower ON public.organisations (lower(name));
CREATE INDEX idx_organisations_phone ON public.organisations (phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_organisations_email_lower ON public.organisations (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX idx_contacts_name_lower ON public.contacts (lower(name));
CREATE INDEX idx_contacts_phone ON public.contacts (phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_contacts_email_lower ON public.contacts (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX idx_opportunities_stage_created ON public.opportunities (stage, created_at DESC);

CREATE OR REPLACE FUNCTION public.normalise_business_name(_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT trim(regexp_replace(
    regexp_replace(lower(coalesce(_value, '')), '\m(private|limited|ltd|pvt|llp)\M', '', 'g'),
    '[^a-z0-9]+', '', 'g'
  ))
$$;

REVOKE ALL ON FUNCTION public.normalise_business_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalise_business_name(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.search_crm(_query text)
RETURNS TABLE(result_type text, result_id uuid, title text, subtitle text, organisation_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS (SELECT '%' || lower(trim(_query)) || '%' AS term)
  SELECT 'organisation'::text, o.id, o.name,
         concat_ws(' · ', nullif(o.city, ''), nullif(o.phone, ''), nullif(o.email, '')),
         o.id
  FROM public.organisations o, q
  WHERE length(trim(_query)) >= 2
    AND (lower(o.name) LIKE q.term OR lower(coalesce(o.phone, '')) LIKE q.term OR lower(coalesce(o.email, '')) LIKE q.term)
  UNION ALL
  SELECT 'contact'::text, c.id, c.name,
         concat_ws(' · ', org.name, nullif(c.phone, ''), nullif(c.email, '')),
         c.organisation_id
  FROM public.contacts c
  JOIN public.organisations org ON org.id = c.organisation_id, q
  WHERE length(trim(_query)) >= 2
    AND (lower(c.name) LIKE q.term OR lower(coalesce(c.phone, '')) LIKE q.term OR lower(coalesce(c.email, '')) LIKE q.term)
  UNION ALL
  SELECT 'opportunity'::text, opp.id, opp.title,
         concat_ws(' · ', org.name, replace(opp.stage::text, '_', ' ')),
         opp.organisation_id
  FROM public.opportunities opp
  JOIN public.organisations org ON org.id = opp.organisation_id, q
  WHERE length(trim(_query)) >= 2
    AND (lower(opp.title) LIKE q.term OR lower(org.name) LIKE q.term OR lower(coalesce(org.phone, '')) LIKE q.term OR lower(coalesce(org.email, '')) LIKE q.term)
  ORDER BY 1, 3
  LIMIT 18
$$;

REVOKE ALL ON FUNCTION public.search_crm(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_crm(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.find_enquiry_duplicates(_name text, _phone text DEFAULT NULL, _email text DEFAULT NULL)
RETURNS TABLE(organisation_id uuid, organisation_name text, owner_name text, stage public.opportunity_stage, has_other_owner_open_pursuit boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (o.id)
    o.id,
    o.name,
    coalesce(p.name, 'Unassigned'),
    opp.stage,
    (opp.id IS NOT NULL AND opp.owner_partner_id <> public.current_partner_id())
  FROM public.organisations o
  LEFT JOIN public.opportunities opp ON opp.organisation_id = o.id AND opp.status = 'open'
  LEFT JOIN public.partners p ON p.id = coalesce(opp.owner_partner_id, o.relationship_owner_partner_id)
  WHERE public.is_active_partner()
    AND (
      (length(public.normalise_business_name(_name)) >= 3 AND public.normalise_business_name(o.name) = public.normalise_business_name(_name))
      OR (nullif(regexp_replace(coalesce(_phone, ''), '[^0-9]+', '', 'g'), '') IS NOT NULL AND regexp_replace(coalesce(o.phone, ''), '[^0-9]+', '', 'g') = regexp_replace(_phone, '[^0-9]+', '', 'g'))
      OR (nullif(lower(trim(coalesce(_email, ''))), '') IS NOT NULL AND lower(trim(coalesce(o.email, ''))) = lower(trim(_email)))
      OR EXISTS (
        SELECT 1 FROM public.contacts c
        WHERE c.organisation_id = o.id
          AND ((nullif(regexp_replace(coalesce(_phone, ''), '[^0-9]+', '', 'g'), '') IS NOT NULL AND regexp_replace(coalesce(c.phone, ''), '[^0-9]+', '', 'g') = regexp_replace(_phone, '[^0-9]+', '', 'g'))
            OR (nullif(lower(trim(coalesce(_email, ''))), '') IS NOT NULL AND lower(trim(coalesce(c.email, ''))) = lower(trim(_email))))
      )
    )
  ORDER BY o.id, opp.created_at DESC NULLS LAST
  LIMIT 6
$$;

REVOKE ALL ON FUNCTION public.find_enquiry_duplicates(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_enquiry_duplicates(text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_enquiry(
  _organisation_id uuid,
  _organisation_name text,
  _contact_name text,
  _phone text,
  _email text,
  _acquisition_source public.acquisition_source,
  _service_line_ids uuid[],
  _owner_partner_id uuid,
  _estimated_gross_fee numeric DEFAULT 0,
  _expected_close_date date DEFAULT NULL,
  _urgency public.enquiry_urgency DEFAULT 'medium',
  _industry text DEFAULT NULL,
  _city text DEFAULT NULL,
  _referral_contact_id uuid DEFAULT NULL,
  _acquired_by_partner_id uuid DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS TABLE(organisation_id uuid, contact_id uuid, opportunity_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.current_partner_id();
  v_org uuid := _organisation_id;
  v_contact uuid;
  v_opportunity uuid;
  v_acquired_by uuid := _acquired_by_partner_id;
  v_managing_partner uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF nullif(trim(_organisation_name), '') IS NULL OR nullif(trim(_contact_name), '') IS NULL THEN
    RAISE EXCEPTION 'Organisation and contact name are required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partners WHERE id = _owner_partner_id AND active) THEN
    RAISE EXCEPTION 'Select an active owner';
  END IF;
  IF coalesce(array_length(_service_line_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Select at least one service line';
  END IF;

  IF _acquisition_source = 'managing_partner' THEN
    SELECT id INTO v_managing_partner FROM public.partners WHERE is_managing_partner AND active ORDER BY created_at LIMIT 1;
    v_acquired_by := v_managing_partner;
  ELSIF _acquisition_source = 'partner_self' THEN
    v_acquired_by := _owner_partner_id;
  END IF;

  IF v_org IS NULL THEN
    INSERT INTO public.organisations (name, status, industry, city, phone, email, relationship_owner_type, relationship_owner_partner_id, created_by)
    VALUES (trim(_organisation_name), 'prospect', nullif(trim(_industry), ''), nullif(trim(_city), ''), nullif(trim(_phone), ''), nullif(lower(trim(_email)), ''), 'partner', _owner_partner_id, v_actor)
    RETURNING id INTO v_org;
  ELSIF NOT EXISTS (SELECT 1 FROM public.organisations WHERE id = v_org) THEN
    RAISE EXCEPTION 'Organisation not found';
  END IF;

  INSERT INTO public.contacts (organisation_id, name, phone, email, created_by)
  VALUES (v_org, trim(_contact_name), nullif(trim(_phone), ''), nullif(lower(trim(_email)), ''), v_actor)
  RETURNING id INTO v_contact;

  INSERT INTO public.opportunities (
    organisation_id, title, owner_partner_id, stage, status, probability,
    estimated_gross_fee, expected_close_date, acquisition_source,
    acquired_by_partner_id, referral_contact_id, requirements, urgency,
    last_activity_date, created_by
  ) VALUES (
    v_org, trim(_organisation_name) || ' — New enquiry', _owner_partner_id, 'enquiry', 'open', 10,
    coalesce(_estimated_gross_fee, 0), _expected_close_date, _acquisition_source,
    v_acquired_by, _referral_contact_id, nullif(trim(_notes), ''), _urgency,
    current_date, v_actor
  ) RETURNING id INTO v_opportunity;

  INSERT INTO public.opportunity_service_lines (opportunity_id, service_line_id, created_by)
  SELECT v_opportunity, service_id, v_actor
  FROM unnest(_service_line_ids) AS service_id
  WHERE EXISTS (SELECT 1 FROM public.service_lines sl WHERE sl.id = service_id AND sl.active)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
  VALUES (v_org, v_opportunity, v_actor, 'enquiry_created', 'New enquiry captured for ' || trim(_organisation_name));

  RETURN QUERY SELECT v_org, v_contact, v_opportunity;
END;
$$;

REVOKE ALL ON FUNCTION public.create_enquiry(uuid, text, text, text, text, public.acquisition_source, uuid[], uuid, numeric, date, public.enquiry_urgency, text, text, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_enquiry(uuid, text, text, text, text, public.acquisition_source, uuid[], uuid, numeric, date, public.enquiry_urgency, text, text, uuid, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_enquiry_stage(_opportunity_id uuid, _action text, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := public.current_partner_id();
  v_org uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.can_edit_opportunity(_opportunity_id) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  SELECT organisation_id INTO v_org FROM public.opportunities WHERE id = _opportunity_id AND stage = 'enquiry';
  IF v_org IS NULL THEN RAISE EXCEPTION 'Enquiry not found'; END IF;

  IF _action = 'qualify' THEN
    UPDATE public.opportunities SET stage = 'qualified_lead', probability = 30, stage_changed_at = now(), last_activity_date = current_date WHERE id = _opportunity_id;
    INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
    VALUES (v_org, _opportunity_id, v_actor, 'enquiry_qualified', 'Enquiry qualified at 30% probability');
  ELSIF _action = 'disqualify' THEN
    IF nullif(trim(_reason), '') IS NULL THEN RAISE EXCEPTION 'A reason is required'; END IF;
    UPDATE public.opportunities SET status = 'disqualified', lost_note = trim(_reason), last_activity_date = current_date WHERE id = _opportunity_id;
    INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
    VALUES (v_org, _opportunity_id, v_actor, 'enquiry_disqualified', trim(_reason));
  ELSE
    RAISE EXCEPTION 'Invalid action';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_enquiry_stage(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_enquiry_stage(uuid, text, text) TO authenticated, service_role;