
-- Recalculate profile reputation score when ratings change

CREATE OR REPLACE FUNCTION public.recalculate_reputation(_rated_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  avg_score numeric;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  SELECT AVG(score)::numeric
  INTO avg_score
  FROM public.ratings
  WHERE rated_id = _rated_id;

  UPDATE public.profiles
  SET reputation_score = COALESCE(ROUND(avg_score, 2), 0)
  WHERE user_id = _rated_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_ratings_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('row_security', 'off', true);

  IF (TG_OP = 'INSERT') THEN
    PERFORM public.recalculate_reputation(NEW.rated_id);
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- If rating changed target user, recalc both old and new
    IF (OLD.rated_id IS DISTINCT FROM NEW.rated_id) THEN
      PERFORM public.recalculate_reputation(OLD.rated_id);
    END IF;
    PERFORM public.recalculate_reputation(NEW.rated_id);
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    PERFORM public.recalculate_reputation(OLD.rated_id);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_ratings_change ON public.ratings;
CREATE TRIGGER on_ratings_change
AFTER INSERT OR UPDATE OR DELETE ON public.ratings
FOR EACH ROW EXECUTE FUNCTION public.handle_ratings_change();
