CREATE OR REPLACE FUNCTION public.restricted_pursuit_notices()
RETURNS TABLE(organisation_id uuid, owner_name text, notice text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    o.organisation_id,
    p.name,
    'Restricted pursuit — contact ' || p.name
  FROM public.opportunities o
  JOIN public.partners p ON p.id = o.owner_partner_id
  WHERE public.is_active_partner()
    AND o.is_restricted = true
    AND NOT public.can_access_opportunity(o.id)
$$;
REVOKE ALL ON FUNCTION public.restricted_pursuit_notices() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restricted_pursuit_notices() TO authenticated, service_role;