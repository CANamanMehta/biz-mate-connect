REVOKE EXECUTE ON FUNCTION public.current_partner_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_active_partner() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_access_opportunity(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_opportunity(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.link_current_partner() FROM anon;
REVOKE EXECUTE ON FUNCTION public.restricted_pursuit_notices() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;