CREATE OR REPLACE FUNCTION public.link_current_partner()
 RETURNS TABLE(partner_id uuid, partner_name text, partner_role app_role)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_user_id uuid := auth.uid();
  v_email text := lower(auth.jwt() ->> 'email');
  v_partner public.partners%ROWTYPE;
  v_role public.app_role;
BEGIN
  IF v_user_id IS NULL OR v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT p.* INTO v_partner
  FROM public.partners p
  WHERE p.user_id = v_user_id OR lower(p.email) = v_email
  ORDER BY (p.user_id = v_user_id) DESC
  LIMIT 1
  FOR UPDATE;

  IF v_partner.id IS NULL OR NOT v_partner.active THEN
    RAISE EXCEPTION 'No active partner invitation matches this email';
  END IF;

  IF EXISTS (SELECT 1 FROM public.partners p WHERE p.user_id = v_user_id AND p.id <> v_partner.id) THEN
    RAISE EXCEPTION 'This login is already linked to another partner';
  END IF;

  UPDATE public.partners p SET user_id = v_user_id, updated_at = now() WHERE p.id = v_partner.id;
  UPDATE public.user_roles ur SET user_id = v_user_id, updated_at = now() WHERE ur.partner_id = v_partner.id;

  SELECT ur.role INTO v_role
  FROM public.user_roles ur
  WHERE ur.partner_id = v_partner.id
  ORDER BY CASE WHEN ur.role = 'admin'::public.app_role THEN 0 ELSE 1 END
  LIMIT 1;

  RETURN QUERY SELECT v_partner.id, v_partner.name, COALESCE(v_role, 'partner'::public.app_role);
END;
$function$;