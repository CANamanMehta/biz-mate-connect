DROP FUNCTION IF EXISTS public.create_enquiry(uuid, text, text, text, text, public.acquisition_source, uuid[], uuid, numeric, date, public.enquiry_urgency, text, text, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.create_enquiry(
  _organisation_name text,
  _contact_name text,
  _acquisition_source public.acquisition_source,
  _service_line_ids uuid[],
  _owner_partner_id uuid,
  _organisation_id uuid DEFAULT NULL,
  _phone text DEFAULT NULL,
  _email text DEFAULT NULL,
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
    v_acquired_by, _referral_contact_id, nullif(trim(_notes), ''), coalesce(_urgency, 'medium'),
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

REVOKE ALL ON FUNCTION public.create_enquiry(text, text, public.acquisition_source, uuid[], uuid, uuid, text, text, numeric, date, public.enquiry_urgency, text, text, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_enquiry(text, text, public.acquisition_source, uuid[], uuid, uuid, text, text, numeric, date, public.enquiry_urgency, text, text, uuid, uuid, text) TO authenticated, service_role;