CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY branches_partner_read ON public.branches FOR SELECT TO authenticated USING (public.is_active_partner());
CREATE POLICY branches_admin_insert ON public.branches FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY branches_admin_update ON public.branches FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY branches_admin_delete ON public.branches FOR DELETE TO authenticated USING (public.is_admin());
CREATE TRIGGER set_branches_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY app_settings_partner_read ON public.app_settings FOR SELECT TO authenticated USING (public.is_active_partner());
CREATE POLICY app_settings_admin_insert ON public.app_settings FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY app_settings_admin_update ON public.app_settings FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY app_settings_admin_delete ON public.app_settings FOR DELETE TO authenticated USING (public.is_admin());
CREATE TRIGGER set_app_settings_updated_at BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_active_partner() AND public.has_role(auth.uid(), 'admin'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.can_access_opportunity(_opportunity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_active_partner() AND EXISTS (
    SELECT 1
    FROM public.opportunities o
    WHERE o.id = _opportunity_id
      AND (
        o.is_restricted = false
        OR public.is_admin()
        OR o.owner_partner_id = public.current_partner_id()
        OR EXISTS (
          SELECT 1 FROM public.opportunity_collaborators oc
          WHERE oc.opportunity_id = o.id
            AND oc.partner_id = public.current_partner_id()
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_edit_opportunity(_opportunity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_active_partner() AND (
    public.is_admin() OR EXISTS (
      SELECT 1
      FROM public.opportunities o
      WHERE o.id = _opportunity_id
        AND (
          o.owner_partner_id = public.current_partner_id()
          OR EXISTS (
            SELECT 1 FROM public.opportunity_collaborators oc
            WHERE oc.opportunity_id = o.id
              AND oc.partner_id = public.current_partner_id()
          )
        )
    )
  )
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_opportunity(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_edit_opportunity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_opportunity(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_opportunity(uuid) TO authenticated, service_role;