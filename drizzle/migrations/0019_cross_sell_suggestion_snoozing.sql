ALTER TABLE public.cross_sell_suggestions
ADD COLUMN snoozed_until date;

CREATE OR REPLACE FUNCTION public.snooze_cross_sell(
  _suggestion_id uuid,
  _until date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _suggestion public.cross_sell_suggestions%ROWTYPE;
  _partner_id uuid;
BEGIN
  IF _until IS NULL OR _until <= CURRENT_DATE THEN
    RAISE EXCEPTION 'Choose a future snooze date';
  END IF;

  SELECT * INTO _suggestion
  FROM public.cross_sell_suggestions
  WHERE id = _suggestion_id
    AND status = 'suggested';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cross-sell idea not found';
  END IF;

  SELECT public.current_partner_id() INTO _partner_id;
  IF _partner_id IS NULL THEN
    RAISE EXCEPTION 'Active partner account required';
  END IF;

  IF NOT public.is_admin()
    AND NOT EXISTS (
      SELECT 1
      FROM public.organisations o
      WHERE o.id = _suggestion.organisation_id
        AND o.relationship_owner_partner_id = _partner_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.opportunities op
      WHERE op.organisation_id = _suggestion.organisation_id
        AND op.owner_partner_id = _partner_id
    )
  THEN
    RAISE EXCEPTION 'You cannot snooze this cross-sell idea';
  END IF;

  UPDATE public.cross_sell_suggestions
  SET snoozed_until = _until,
      updated_at = now()
  WHERE id = _suggestion_id;

  INSERT INTO public.activity_log (
    organisation_id,
    actor_partner_id,
    action,
    detail
  ) VALUES (
    _suggestion.organisation_id,
    _partner_id,
    'cross_sell_snoozed',
    'Cross-sell idea snoozed until ' || to_char(_until, 'DD Mon YYYY')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.snooze_cross_sell(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.snooze_cross_sell(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.snooze_cross_sell(uuid, date) TO service_role;