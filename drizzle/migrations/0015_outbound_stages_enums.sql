ALTER TYPE public.opportunity_stage ADD VALUE IF NOT EXISTS 'target' BEFORE 'enquiry';
ALTER TYPE public.opportunity_stage ADD VALUE IF NOT EXISTS 'research' BEFORE 'enquiry';
ALTER TYPE public.opportunity_stage ADD VALUE IF NOT EXISTS 'outreach' BEFORE 'enquiry';
ALTER TYPE public.opportunity_stage ADD VALUE IF NOT EXISTS 'first_meeting' BEFORE 'qualified_lead';
ALTER TYPE public.acquisition_source ADD VALUE IF NOT EXISTS 'outbound_research';
CREATE TYPE public.research_status AS ENUM ('not_started','in_progress','done');
CREATE TYPE public.document_type AS ENUM ('research_report','proposal','engagement_letter','nda','other');
ALTER TABLE public.opportunities
  ADD COLUMN research_status public.research_status NOT NULL DEFAULT 'not_started',
  ADD COLUMN research_due_date date,
  ADD COLUMN target_rationale text;
ALTER TABLE public.meetings ADD COLUMN outcome text;

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE CASCADE,
  doc_type public.document_type NOT NULL DEFAULT 'other',
  version integer NOT NULL DEFAULT 1,
  file_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  notes text,
  uploaded_by uuid REFERENCES public.partners(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_org_idx ON public.documents(organisation_id);
CREATE INDEX documents_opp_idx ON public.documents(opportunity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Partners view visible documents" ON public.documents FOR SELECT TO authenticated
  USING (public.is_active_partner() AND (opportunity_id IS NULL OR public.can_access_opportunity(opportunity_id)));
CREATE POLICY "Partners upload documents" ON public.documents FOR INSERT TO authenticated
  WITH CHECK (public.is_active_partner() AND uploaded_by = public.current_partner_id()
    AND (opportunity_id IS NULL OR public.can_access_opportunity(opportunity_id)));
CREATE POLICY "Uploader or admin edits documents" ON public.documents FOR UPDATE TO authenticated
  USING (uploaded_by = public.current_partner_id() OR public.is_admin());
CREATE POLICY "Uploader or admin deletes documents" ON public.documents FOR DELETE TO authenticated
  USING (uploaded_by = public.current_partner_id() OR public.is_admin());
CREATE TRIGGER set_documents_updated_at BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.documents_set_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.opportunity_id IS NOT NULL THEN
    SELECT organisation_id INTO NEW.organisation_id FROM public.opportunities WHERE id = NEW.opportunity_id;
  END IF;
  SELECT coalesce(max(version), 0) + 1 INTO NEW.version FROM public.documents
  WHERE organisation_id = NEW.organisation_id AND opportunity_id IS NOT DISTINCT FROM NEW.opportunity_id AND doc_type = NEW.doc_type;
  NEW.uploaded_at := now();
  INSERT INTO public.activity_log (organisation_id, opportunity_id, actor_partner_id, action, detail)
  VALUES (NEW.organisation_id, NEW.opportunity_id, NEW.uploaded_by, 'document_uploaded',
    initcap(replace(NEW.doc_type::text, '_', ' ')) || ' v' || NEW.version || ' uploaded: ' || NEW.file_name);
  RETURN NEW;
END $$;
CREATE TRIGGER documents_set_version BEFORE INSERT ON public.documents FOR EACH ROW EXECUTE FUNCTION public.documents_set_version();