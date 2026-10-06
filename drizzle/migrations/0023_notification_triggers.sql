CREATE OR REPLACE FUNCTION public.notify_opportunity_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_actor uuid := public.current_partner_id(); v_org text; v_link text := '/opportunities/' || NEW.id; v_owner_name text;
BEGIN
  SELECT name INTO v_org FROM public.organisations WHERE id = NEW.organisation_id;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.owner_partner_id IS DISTINCT FROM OLD.owner_partner_id AND NEW.owner_partner_id IS DISTINCT FROM v_actor THEN
      INSERT INTO public.notifications (partner_id, type, message, link, is_read)
      VALUES (NEW.owner_partner_id, 'opportunity_owner', 'You now own ' || coalesce(v_org,'') || ' - ' || NEW.title, v_link, false);
    END IF;
    IF NEW.stage IS DISTINCT FROM OLD.stage AND NEW.stage IN ('proposal','negotiation') THEN
      INSERT INTO public.notifications (partner_id, type, message, link, is_read)
      SELECT DISTINCT oc.partner_id, 'opportunity_stage', coalesce(v_org,'') || ' - ' || NEW.title || ' moved to ' || initcap(NEW.stage::text), v_link, false
      FROM public.opportunity_collaborators oc
      WHERE oc.opportunity_id = NEW.id AND oc.partner_id IS DISTINCT FROM v_actor;
    END IF;
  ELSE
    SELECT name INTO v_owner_name FROM public.partners WHERE id = NEW.owner_partner_id;
    INSERT INTO public.notifications (partner_id, type, message, link, is_read)
    SELECT DISTINCT o.owner_partner_id, 'opportunity_coordinate',
      coalesce(v_owner_name,'A partner') || ' has opened a new deal for ' || coalesce(v_org,'') || ' - coordinate', v_link, false
    FROM public.opportunities o
    WHERE o.organisation_id = NEW.organisation_id AND o.id <> NEW.id AND o.status = 'open' AND o.stage <> 'converted'
      AND o.owner_partner_id <> NEW.owner_partner_id AND o.owner_partner_id IS DISTINCT FROM v_actor;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_notify_opportunity_update AFTER UPDATE OF owner_partner_id, stage ON public.opportunities
FOR EACH ROW EXECUTE FUNCTION public.notify_opportunity_changes();
CREATE TRIGGER trg_notify_opportunity_insert AFTER INSERT ON public.opportunities
FOR EACH ROW EXECUTE FUNCTION public.notify_opportunity_changes();

CREATE OR REPLACE FUNCTION public.notify_collaborator_added()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_actor uuid := public.current_partner_id(); v_org text; v_title text;
BEGIN
  IF NEW.partner_id IS NOT DISTINCT FROM v_actor THEN RETURN NEW; END IF;
  SELECT org.name, o.title INTO v_org, v_title FROM public.opportunities o JOIN public.organisations org ON org.id = o.organisation_id WHERE o.id = NEW.opportunity_id;
  INSERT INTO public.notifications (partner_id, type, message, link, is_read)
  VALUES (NEW.partner_id, 'collaborator_added', 'You were added as a collaborator on ' || coalesce(v_org,'') || ' - ' || coalesce(v_title,''), '/opportunities/' || NEW.opportunity_id, false);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_notify_collaborator_added AFTER INSERT ON public.opportunity_collaborators
FOR EACH ROW EXECUTE FUNCTION public.notify_collaborator_added();

CREATE OR REPLACE FUNCTION public.notify_task_assignee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_actor uuid := public.current_partner_id();
BEGIN
  IF v_actor IS NULL OR NEW.owner_partner_id = v_actor OR NEW.status <> 'open' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.owner_partner_id IS NOT DISTINCT FROM OLD.owner_partner_id THEN RETURN NEW; END IF;
  INSERT INTO public.notifications (partner_id, type, message, link, is_read)
  VALUES (NEW.owner_partner_id, 'task_assigned', 'New task: ' || NEW.title || ' due ' || to_char(NEW.due_date, 'DD Mon YYYY'),
    CASE WHEN NEW.opportunity_id IS NOT NULL THEN '/opportunities/' || NEW.opportunity_id ELSE '/tasks' END, false);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_notify_task_insert AFTER INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_assignee();
CREATE TRIGGER trg_notify_task_reassign AFTER UPDATE OF owner_partner_id ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_assignee();

REVOKE EXECUTE ON FUNCTION public.notify_opportunity_changes(), public.notify_collaborator_added(), public.notify_task_assignee() FROM PUBLIC, anon, authenticated;