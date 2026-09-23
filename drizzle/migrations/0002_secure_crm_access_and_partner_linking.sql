ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.partners(id) ON DELETE SET NULL;
ALTER TABLE public.organisation_services ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.partners(id) ON DELETE SET NULL;
ALTER TABLE public.opportunity_service_lines ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.partners(id) ON DELETE SET NULL;
ALTER TABLE public.opportunity_collaborators ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.partners(id) ON DELETE SET NULL;
ALTER TABLE public.revenue_allocations ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.partners(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.partners(id) ON DELETE SET NULL;
ALTER TABLE public.lead_costs ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.partners(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.partners.user_id IS 'Auth user ID. Placeholder UUIDs are replaced on first login by public.link_current_partner().';

CREATE OR REPLACE FUNCTION public.current_partner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.partners
  WHERE user_id = auth.uid() AND active = true
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_active_partner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.partners
    WHERE user_id = auth.uid() AND active = true
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.can_access_opportunity(_opportunity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
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
  SELECT public.is_admin() OR EXISTS (
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
$$;

CREATE OR REPLACE FUNCTION public.link_current_partner()
RETURNS TABLE(partner_id uuid, partner_name text, partner_role public.app_role)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text := lower(auth.jwt() ->> 'email');
  v_partner public.partners%ROWTYPE;
  v_role public.app_role;
BEGIN
  IF v_user_id IS NULL OR v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_partner
  FROM public.partners
  WHERE user_id = v_user_id
     OR lower(email) = v_email
  ORDER BY (user_id = v_user_id) DESC
  LIMIT 1
  FOR UPDATE;

  IF v_partner.id IS NULL OR NOT v_partner.active THEN
    RAISE EXCEPTION 'No active partner invitation matches this email';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.partners
    WHERE user_id = v_user_id AND id <> v_partner.id
  ) THEN
    RAISE EXCEPTION 'This login is already linked to another partner';
  END IF;

  UPDATE public.partners
  SET user_id = v_user_id, updated_at = now()
  WHERE id = v_partner.id;

  UPDATE public.user_roles
  SET user_id = v_user_id, updated_at = now()
  WHERE partner_id = v_partner.id;

  SELECT ur.role INTO v_role
  FROM public.user_roles ur
  WHERE ur.partner_id = v_partner.id
  ORDER BY CASE WHEN ur.role = 'admin'::public.app_role THEN 0 ELSE 1 END
  LIMIT 1;

  RETURN QUERY SELECT v_partner.id, v_partner.name, COALESCE(v_role, 'partner'::public.app_role);
END;
$$;

REVOKE ALL ON FUNCTION public.current_partner_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_partner() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_opportunity(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_edit_opportunity(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_current_partner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_partner_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_partner() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_opportunity(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_opportunity(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.link_current_partner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_current_partner() TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

DROP POLICY IF EXISTS partners_read_internal ON public.partners;
DROP POLICY IF EXISTS partners_admin_insert ON public.partners;
DROP POLICY IF EXISTS partners_update_self_or_admin ON public.partners;
DROP POLICY IF EXISTS partners_admin_delete ON public.partners;
CREATE POLICY partners_active_read ON public.partners FOR SELECT TO authenticated USING (public.is_active_partner());
CREATE POLICY partners_admin_insert ON public.partners FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY partners_admin_update ON public.partners FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY partners_admin_delete ON public.partners FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS roles_read_self_or_admin ON public.user_roles;
DROP POLICY IF EXISTS roles_admin_insert ON public.user_roles;
DROP POLICY IF EXISTS roles_admin_update ON public.user_roles;
DROP POLICY IF EXISTS roles_admin_delete ON public.user_roles;
CREATE POLICY roles_read_self_or_admin ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY roles_admin_insert ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY roles_admin_update ON public.user_roles FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY roles_admin_delete ON public.user_roles FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS service_lines_read_internal ON public.service_lines;
DROP POLICY IF EXISTS service_lines_admin_insert ON public.service_lines;
DROP POLICY IF EXISTS service_lines_admin_update ON public.service_lines;
DROP POLICY IF EXISTS service_lines_admin_delete ON public.service_lines;
CREATE POLICY service_lines_partner_read ON public.service_lines FOR SELECT TO authenticated USING (public.is_active_partner());
CREATE POLICY service_lines_admin_insert ON public.service_lines FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY service_lines_admin_update ON public.service_lines FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY service_lines_admin_delete ON public.service_lines FOR DELETE TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS organisations_internal_all ON public.organisations;
CREATE POLICY organisations_partner_read ON public.organisations FOR SELECT TO authenticated USING (public.is_active_partner());
CREATE POLICY organisations_partner_insert ON public.organisations FOR INSERT TO authenticated WITH CHECK (public.is_active_partner() AND created_by = public.current_partner_id());
CREATE POLICY organisations_owner_update ON public.organisations FOR UPDATE TO authenticated USING (public.is_admin() OR created_by = public.current_partner_id() OR relationship_owner_partner_id = public.current_partner_id()) WITH CHECK (public.is_active_partner());
CREATE POLICY organisations_owner_delete ON public.organisations FOR DELETE TO authenticated USING (public.is_admin() OR created_by = public.current_partner_id() OR relationship_owner_partner_id = public.current_partner_id());

DROP POLICY IF EXISTS contacts_internal_all ON public.contacts;
CREATE POLICY contacts_partner_read ON public.contacts FOR SELECT TO authenticated USING (public.is_active_partner());
CREATE POLICY contacts_partner_insert ON public.contacts FOR INSERT TO authenticated WITH CHECK (public.is_active_partner() AND created_by = public.current_partner_id());
CREATE POLICY contacts_creator_update ON public.contacts FOR UPDATE TO authenticated USING (public.is_admin() OR created_by = public.current_partner_id()) WITH CHECK (public.is_active_partner());
CREATE POLICY contacts_creator_delete ON public.contacts FOR DELETE TO authenticated USING (public.is_admin() OR created_by = public.current_partner_id());

DROP POLICY IF EXISTS organisation_services_internal_all ON public.organisation_services;
CREATE POLICY organisation_services_partner_read ON public.organisation_services FOR SELECT TO authenticated USING (public.is_active_partner());
CREATE POLICY organisation_services_partner_insert ON public.organisation_services FOR INSERT TO authenticated WITH CHECK (public.is_active_partner() AND created_by = public.current_partner_id());
CREATE POLICY organisation_services_creator_update ON public.organisation_services FOR UPDATE TO authenticated USING (public.is_admin() OR created_by = public.current_partner_id()) WITH CHECK (public.is_active_partner());
CREATE POLICY organisation_services_creator_delete ON public.organisation_services FOR DELETE TO authenticated USING (public.is_admin() OR created_by = public.current_partner_id());

DROP POLICY IF EXISTS opportunities_internal_all ON public.opportunities;
CREATE POLICY opportunities_access_read ON public.opportunities FOR SELECT TO authenticated USING (public.can_access_opportunity(id));
CREATE POLICY opportunities_partner_insert ON public.opportunities FOR INSERT TO authenticated WITH CHECK (public.is_active_partner() AND created_by = public.current_partner_id());
CREATE POLICY opportunities_owner_collaborator_update ON public.opportunities FOR UPDATE TO authenticated USING (public.can_edit_opportunity(id)) WITH CHECK (public.is_active_partner());
CREATE POLICY opportunities_owner_collaborator_delete ON public.opportunities FOR DELETE TO authenticated USING (public.can_edit_opportunity(id));

DROP POLICY IF EXISTS opportunity_collaborators_internal_all ON public.opportunity_collaborators;
CREATE POLICY opportunity_collaborators_access_read ON public.opportunity_collaborators FOR SELECT TO authenticated USING (public.can_access_opportunity(opportunity_id));
CREATE POLICY opportunity_collaborators_editor_insert ON public.opportunity_collaborators FOR INSERT TO authenticated WITH CHECK (public.can_edit_opportunity(opportunity_id) AND created_by = public.current_partner_id());
CREATE POLICY opportunity_collaborators_editor_update ON public.opportunity_collaborators FOR UPDATE TO authenticated USING (public.can_edit_opportunity(opportunity_id)) WITH CHECK (public.can_edit_opportunity(opportunity_id));
CREATE POLICY opportunity_collaborators_editor_delete ON public.opportunity_collaborators FOR DELETE TO authenticated USING (public.can_edit_opportunity(opportunity_id));

DROP POLICY IF EXISTS opportunity_service_lines_internal_all ON public.opportunity_service_lines;
CREATE POLICY opportunity_service_lines_access_read ON public.opportunity_service_lines FOR SELECT TO authenticated USING (public.can_access_opportunity(opportunity_id));
CREATE POLICY opportunity_service_lines_editor_insert ON public.opportunity_service_lines FOR INSERT TO authenticated WITH CHECK (public.can_edit_opportunity(opportunity_id) AND created_by = public.current_partner_id());
CREATE POLICY opportunity_service_lines_editor_update ON public.opportunity_service_lines FOR UPDATE TO authenticated USING (public.can_edit_opportunity(opportunity_id)) WITH CHECK (public.can_edit_opportunity(opportunity_id));
CREATE POLICY opportunity_service_lines_editor_delete ON public.opportunity_service_lines FOR DELETE TO authenticated USING (public.can_edit_opportunity(opportunity_id));

DROP POLICY IF EXISTS meetings_internal_all ON public.meetings;
CREATE POLICY meetings_access_read ON public.meetings FOR SELECT TO authenticated USING (public.is_active_partner() AND (opportunity_id IS NULL OR public.can_access_opportunity(opportunity_id)));
CREATE POLICY meetings_partner_insert ON public.meetings FOR INSERT TO authenticated WITH CHECK (public.is_active_partner() AND created_by = public.current_partner_id() AND (opportunity_id IS NULL OR public.can_access_opportunity(opportunity_id)));
CREATE POLICY meetings_creator_update ON public.meetings FOR UPDATE TO authenticated USING (public.is_admin() OR created_by = public.current_partner_id()) WITH CHECK (opportunity_id IS NULL OR public.can_access_opportunity(opportunity_id));
CREATE POLICY meetings_creator_delete ON public.meetings FOR DELETE TO authenticated USING (public.is_admin() OR created_by = public.current_partner_id());

DROP POLICY IF EXISTS meeting_contacts_internal_all ON public.meeting_contacts;
CREATE POLICY meeting_contacts_access_read ON public.meeting_contacts FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id));
CREATE POLICY meeting_contacts_editor_insert ON public.meeting_contacts FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (public.is_admin() OR m.created_by = public.current_partner_id())));
CREATE POLICY meeting_contacts_editor_delete ON public.meeting_contacts FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (public.is_admin() OR m.created_by = public.current_partner_id())));
CREATE POLICY meeting_contacts_editor_update ON public.meeting_contacts FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (public.is_admin() OR m.created_by = public.current_partner_id()))) WITH CHECK (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (public.is_admin() OR m.created_by = public.current_partner_id())));

DROP POLICY IF EXISTS meeting_partners_internal_all ON public.meeting_partners;
CREATE POLICY meeting_partners_access_read ON public.meeting_partners FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id));
CREATE POLICY meeting_partners_editor_insert ON public.meeting_partners FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (public.is_admin() OR m.created_by = public.current_partner_id())));
CREATE POLICY meeting_partners_editor_delete ON public.meeting_partners FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (public.is_admin() OR m.created_by = public.current_partner_id())));
CREATE POLICY meeting_partners_editor_update ON public.meeting_partners FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (public.is_admin() OR m.created_by = public.current_partner_id()))) WITH CHECK (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND (public.is_admin() OR m.created_by = public.current_partner_id())));

DROP POLICY IF EXISTS tasks_internal_all ON public.tasks;
CREATE POLICY tasks_access_read ON public.tasks FOR SELECT TO authenticated USING (public.is_active_partner() AND (opportunity_id IS NULL OR public.can_access_opportunity(opportunity_id)));
CREATE POLICY tasks_partner_insert ON public.tasks FOR INSERT TO authenticated WITH CHECK (public.is_active_partner() AND created_by = public.current_partner_id() AND (opportunity_id IS NULL OR public.can_access_opportunity(opportunity_id)));
CREATE POLICY tasks_owner_creator_update ON public.tasks FOR UPDATE TO authenticated USING (public.is_admin() OR owner_partner_id = public.current_partner_id() OR created_by = public.current_partner_id()) WITH CHECK (opportunity_id IS NULL OR public.can_access_opportunity(opportunity_id));
CREATE POLICY tasks_owner_creator_delete ON public.tasks FOR DELETE TO authenticated USING (public.is_admin() OR owner_partner_id = public.current_partner_id() OR created_by = public.current_partner_id());

DROP POLICY IF EXISTS revenue_allocations_internal_all ON public.revenue_allocations;
CREATE POLICY allocations_access_read ON public.revenue_allocations FOR SELECT TO authenticated USING (public.can_access_opportunity(opportunity_id));
CREATE POLICY allocations_partner_insert ON public.revenue_allocations FOR INSERT TO authenticated WITH CHECK (public.can_edit_opportunity(opportunity_id) AND created_by = public.current_partner_id());
CREATE POLICY allocations_creator_update ON public.revenue_allocations FOR UPDATE TO authenticated USING (public.is_admin() OR created_by = public.current_partner_id()) WITH CHECK (public.can_access_opportunity(opportunity_id));
CREATE POLICY allocations_creator_delete ON public.revenue_allocations FOR DELETE TO authenticated USING (public.is_admin() OR created_by = public.current_partner_id());

DROP POLICY IF EXISTS lead_costs_internal_all ON public.lead_costs;
CREATE POLICY lead_costs_access_read ON public.lead_costs FOR SELECT TO authenticated USING (public.can_access_opportunity(opportunity_id));
CREATE POLICY lead_costs_partner_insert ON public.lead_costs FOR INSERT TO authenticated WITH CHECK (public.can_access_opportunity(opportunity_id) AND created_by = public.current_partner_id());
CREATE POLICY lead_costs_creator_update ON public.lead_costs FOR UPDATE TO authenticated USING (public.is_admin() OR created_by = public.current_partner_id() OR incurred_by_partner_id = public.current_partner_id()) WITH CHECK (public.can_access_opportunity(opportunity_id));
CREATE POLICY lead_costs_creator_delete ON public.lead_costs FOR DELETE TO authenticated USING (public.is_admin() OR created_by = public.current_partner_id() OR incurred_by_partner_id = public.current_partner_id());

DROP POLICY IF EXISTS activity_log_internal_read ON public.activity_log;
DROP POLICY IF EXISTS activity_log_internal_insert ON public.activity_log;
CREATE POLICY activity_log_access_read ON public.activity_log FOR SELECT TO authenticated USING (public.is_active_partner() AND (opportunity_id IS NULL OR public.can_access_opportunity(opportunity_id)));
CREATE POLICY activity_log_actor_insert ON public.activity_log FOR INSERT TO authenticated WITH CHECK (public.is_active_partner() AND actor_partner_id = public.current_partner_id() AND (opportunity_id IS NULL OR public.can_access_opportunity(opportunity_id)));

DROP POLICY IF EXISTS notifications_own_read ON public.notifications;
DROP POLICY IF EXISTS notifications_own_update ON public.notifications;
DROP POLICY IF EXISTS notifications_own_delete ON public.notifications;
CREATE POLICY notifications_own_read ON public.notifications FOR SELECT TO authenticated USING (partner_id = public.current_partner_id());
CREATE POLICY notifications_own_update ON public.notifications FOR UPDATE TO authenticated USING (partner_id = public.current_partner_id()) WITH CHECK (partner_id = public.current_partner_id());
CREATE POLICY notifications_own_delete ON public.notifications FOR DELETE TO authenticated USING (partner_id = public.current_partner_id());

CREATE INDEX IF NOT EXISTS contacts_created_by_idx ON public.contacts(created_by);
CREATE INDEX IF NOT EXISTS organisation_services_created_by_idx ON public.organisation_services(created_by);
CREATE INDEX IF NOT EXISTS opportunity_service_lines_created_by_idx ON public.opportunity_service_lines(created_by);
CREATE INDEX IF NOT EXISTS opportunity_collaborators_created_by_idx ON public.opportunity_collaborators(created_by);
CREATE INDEX IF NOT EXISTS revenue_allocations_created_by_idx ON public.revenue_allocations(created_by);
CREATE INDEX IF NOT EXISTS tasks_created_by_idx ON public.tasks(created_by);
CREATE INDEX IF NOT EXISTS lead_costs_created_by_idx ON public.lead_costs(created_by);