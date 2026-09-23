CREATE TYPE public.app_role AS ENUM ('partner', 'admin');
CREATE TYPE public.organisation_status AS ENUM ('prospect', 'client', 'dormant');
CREATE TYPE public.relationship_owner_type AS ENUM ('partner', 'branch', 'ho');
CREATE TYPE public.organisation_service_status AS ENUM ('engaged', 'past', 'pitched', 'not_relevant');
CREATE TYPE public.contact_role AS ENUM ('promoter', 'director', 'CFO', 'CS', 'finance_head', 'influencer', 'gatekeeper', 'other');
CREATE TYPE public.opportunity_stage AS ENUM ('enquiry', 'qualified_lead', 'meeting_discovery', 'proposal', 'negotiation', 'converted');
CREATE TYPE public.opportunity_status AS ENUM ('open', 'on_hold', 'lost', 'disqualified');
CREATE TYPE public.acquisition_source AS ENUM ('managing_partner', 'partner_self', 'branch', 'external_referral', 'existing_client', 'website', 'event', 'walk_in', 'cold_outreach', 'social');
CREATE TYPE public.execution_mode AS ENUM ('solo', 'collaboration', 'ho_executed', 'branch_executed', 'split_ho_branch');
CREATE TYPE public.lost_reason AS ENUM ('price', 'competitor', 'no_budget', 'no_decision', 'in_house', 'timing', 'other');
CREATE TYPE public.beneficiary_type AS ENUM ('firm_mp', 'partner', 'branch', 'ho');
CREATE TYPE public.allocation_component AS ENUM ('firm_base', 'referral_acquisition', 'execution', 'branch_profit_share', 'custom');
CREATE TYPE public.allocation_base AS ENUM ('gross', 'net');
CREATE TYPE public.interaction_type AS ENUM ('meeting', 'call', 'email', 'whatsapp', 'note');
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE public.task_status AS ENUM ('open', 'done', 'cancelled');
CREATE TYPE public.task_source AS ENUM ('manual', 'from_meeting', 'stale_alert', 'conversion', 'cross_sell');
CREATE TYPE public.lead_cost_type AS ENUM ('partner_time', 'travel', 'proposal_prep', 'other');

CREATE TABLE public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  branch text NOT NULL CHECK (branch IN ('Jaipur-HO', 'Indore', 'Ahmedabad', 'other')),
  is_managing_partner boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partners TO authenticated;
GRANT ALL ON public.partners TO service_role;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'partner',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role),
  UNIQUE (partner_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE TABLE public.service_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  cluster text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_lines TO authenticated;
GRANT ALL ON public.service_lines TO service_role;
ALTER TABLE public.service_lines ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status public.organisation_status NOT NULL DEFAULT 'prospect',
  industry text,
  group_parent text,
  city text,
  home_branch text CHECK (home_branch IS NULL OR home_branch IN ('Jaipur-HO', 'Indore', 'Ahmedabad', 'other')),
  size_band text CHECK (size_band IS NULL OR size_band IN ('<10 Cr', '10-50 Cr', '50-250 Cr', '250 Cr+')),
  relationship_owner_type public.relationship_owner_type,
  relationship_owner_partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  relationship_owner_branch text CHECK (relationship_owner_branch IS NULL OR relationship_owner_branch IN ('Jaipur-HO', 'Indore', 'Ahmedabad', 'other')),
  phone text,
  email text,
  website text,
  notes text,
  created_by uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    relationship_owner_type IS NULL OR
    (relationship_owner_type = 'partner' AND relationship_owner_partner_id IS NOT NULL) OR
    (relationship_owner_type = 'branch' AND relationship_owner_branch IS NOT NULL) OR
    relationship_owner_type = 'ho'
  )
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisations TO authenticated;
GRANT ALL ON public.organisations TO service_role;
ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organisation_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  service_line_id uuid NOT NULL REFERENCES public.service_lines(id) ON DELETE CASCADE,
  status public.organisation_service_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, service_line_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisation_services TO authenticated;
GRANT ALL ON public.organisation_services TO service_role;
ALTER TABLE public.organisation_services ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  designation text,
  role public.contact_role,
  phone text,
  email text,
  is_decision_maker boolean NOT NULL DEFAULT false,
  is_referrer boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  title text NOT NULL,
  owner_partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  stage public.opportunity_stage NOT NULL DEFAULT 'enquiry',
  status public.opportunity_status NOT NULL DEFAULT 'open',
  probability integer NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  estimated_gross_fee numeric(14,2) NOT NULL DEFAULT 0 CHECK (estimated_gross_fee >= 0),
  estimated_expenses numeric(14,2) NOT NULL DEFAULT 0 CHECK (estimated_expenses >= 0),
  estimated_net_profit numeric(14,2) GENERATED ALWAYS AS (estimated_gross_fee - estimated_expenses) STORED,
  expected_close_date date,
  acquisition_source public.acquisition_source,
  acquired_by_partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  referral_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  execution_mode public.execution_mode,
  sharing_template text,
  requirements text,
  blockers text,
  competitors text,
  next_action text,
  next_action_date date,
  last_activity_date date,
  stage_changed_at timestamptz NOT NULL DEFAULT now(),
  lost_reason public.lost_reason,
  lost_note text,
  on_hold_revisit_date date,
  is_restricted boolean NOT NULL DEFAULT false,
  conflict_check_confirmed boolean NOT NULL DEFAULT false,
  conflict_check_by uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  conflict_check_at timestamptz,
  converted_at timestamptz,
  created_by uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunities TO authenticated;
GRANT ALL ON public.opportunities TO service_role;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.opportunity_service_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  service_line_id uuid NOT NULL REFERENCES public.service_lines(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, service_line_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_service_lines TO authenticated;
GRANT ALL ON public.opportunity_service_lines TO service_role;
ALTER TABLE public.opportunity_service_lines ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.opportunity_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (opportunity_id, partner_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunity_collaborators TO authenticated;
GRANT ALL ON public.opportunity_collaborators TO service_role;
ALTER TABLE public.opportunity_collaborators ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.revenue_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  beneficiary_type public.beneficiary_type NOT NULL,
  beneficiary_partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  beneficiary_branch text CHECK (beneficiary_branch IS NULL OR beneficiary_branch IN ('Jaipur-HO', 'Indore', 'Ahmedabad', 'other')),
  component public.allocation_component NOT NULL,
  base public.allocation_base NOT NULL,
  share_pct numeric(7,4) NOT NULL CHECK (share_pct >= 0 AND share_pct <= 100),
  computed_amount numeric(14,2) NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (beneficiary_type = 'partner' AND beneficiary_partner_id IS NOT NULL) OR
    (beneficiary_type = 'branch' AND beneficiary_branch IS NOT NULL) OR
    beneficiary_type IN ('firm_mp', 'ho')
  )
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.revenue_allocations TO authenticated;
GRANT ALL ON public.revenue_allocations TO service_role;
ALTER TABLE public.revenue_allocations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  type public.interaction_type NOT NULL,
  meeting_date timestamptz NOT NULL,
  duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes >= 0),
  location_or_link text,
  agenda text,
  summary text,
  requirements_identified text,
  commitments text,
  objections text,
  decisions text,
  next_step text NOT NULL,
  next_step_date date NOT NULL,
  calendar_event_id text,
  created_by uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings TO authenticated;
GRANT ALL ON public.meetings TO service_role;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.meeting_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, contact_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_contacts TO authenticated;
GRANT ALL ON public.meeting_contacts TO service_role;
ALTER TABLE public.meeting_contacts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.meeting_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, partner_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_partners TO authenticated;
GRANT ALL ON public.meeting_partners TO service_role;
ALTER TABLE public.meeting_partners ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE CASCADE,
  organisation_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  meeting_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
  title text NOT NULL,
  owner_partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE RESTRICT,
  due_date date NOT NULL,
  priority public.task_priority NOT NULL DEFAULT 'medium',
  status public.task_status NOT NULL DEFAULT 'open',
  is_recurring boolean NOT NULL DEFAULT false,
  recurrence_days integer CHECK (recurrence_days IS NULL OR recurrence_days > 0),
  source public.task_source NOT NULL DEFAULT 'manual',
  escalated boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT is_recurring OR recurrence_days IS NOT NULL)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.lead_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  cost_type public.lead_cost_type NOT NULL,
  effort_minutes integer CHECK (effort_minutes IS NULL OR effort_minutes >= 0),
  amount_inr numeric(14,2) CHECK (amount_inr IS NULL OR amount_inr >= 0),
  incurred_by_partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  incurred_date date NOT NULL,
  auto_from_meeting_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_costs TO authenticated;
GRANT ALL ON public.lead_costs TO service_role;
ALTER TABLE public.lead_costs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  actor_partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  action text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text NOT NULL,
  link text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['partners','user_roles','service_lines','organisations','organisation_services','contacts','opportunities','opportunity_service_lines','opportunity_collaborators','revenue_allocations','meetings','meeting_contacts','meeting_partners','tasks','lead_costs','activity_log','notifications']
  LOOP
    EXECUTE format('CREATE TRIGGER set_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $$;

CREATE POLICY partners_read_internal ON public.partners FOR SELECT TO authenticated USING (true);
CREATE POLICY partners_update_self_or_admin ON public.partners FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin')) WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY partners_admin_insert ON public.partners FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY partners_admin_delete ON public.partners FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY roles_read_self_or_admin ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY roles_admin_insert ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY roles_admin_update ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY roles_admin_delete ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY service_lines_read_internal ON public.service_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY service_lines_admin_insert ON public.service_lines FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY service_lines_admin_update ON public.service_lines FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY service_lines_admin_delete ON public.service_lines FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY organisations_internal_all ON public.organisations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY organisation_services_internal_all ON public.organisation_services FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY contacts_internal_all ON public.contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY opportunities_internal_all ON public.opportunities FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY opportunity_service_lines_internal_all ON public.opportunity_service_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY opportunity_collaborators_internal_all ON public.opportunity_collaborators FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY revenue_allocations_internal_all ON public.revenue_allocations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY meetings_internal_all ON public.meetings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY meeting_contacts_internal_all ON public.meeting_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY meeting_partners_internal_all ON public.meeting_partners FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY tasks_internal_all ON public.tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY lead_costs_internal_all ON public.lead_costs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY activity_log_internal_read ON public.activity_log FOR SELECT TO authenticated USING (true);
CREATE POLICY activity_log_internal_insert ON public.activity_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY notifications_own_read ON public.notifications FOR SELECT TO authenticated USING (partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid()));
CREATE POLICY notifications_own_update ON public.notifications FOR UPDATE TO authenticated USING (partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid())) WITH CHECK (partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid()));
CREATE POLICY notifications_own_delete ON public.notifications FOR DELETE TO authenticated USING (partner_id IN (SELECT id FROM public.partners WHERE user_id = auth.uid()));

CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_organisations_status ON public.organisations(status);
CREATE INDEX idx_organisations_owner_partner ON public.organisations(relationship_owner_partner_id);
CREATE INDEX idx_contacts_organisation ON public.contacts(organisation_id);
CREATE INDEX idx_opportunities_organisation ON public.opportunities(organisation_id);
CREATE INDEX idx_opportunities_owner_stage_status ON public.opportunities(owner_partner_id, stage, status);
CREATE INDEX idx_opportunities_close_date ON public.opportunities(expected_close_date);
CREATE INDEX idx_meetings_opportunity_date ON public.meetings(opportunity_id, meeting_date DESC);
CREATE INDEX idx_meetings_organisation_date ON public.meetings(organisation_id, meeting_date DESC);
CREATE INDEX idx_tasks_owner_status_due ON public.tasks(owner_partner_id, status, due_date);
CREATE INDEX idx_activity_log_organisation_created ON public.activity_log(organisation_id, created_at DESC);
CREATE INDEX idx_activity_log_opportunity_created ON public.activity_log(opportunity_id, created_at DESC);
CREATE INDEX idx_notifications_partner_unread ON public.notifications(partner_id, is_read, created_at DESC);