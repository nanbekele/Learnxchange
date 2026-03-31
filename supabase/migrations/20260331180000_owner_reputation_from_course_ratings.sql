-- Trigger function to update owner reputation from course ratings
CREATE OR REPLACE FUNCTION public.update_owner_reputation_from_course_rating()
RETURNS TRIGGER AS $$
DECLARE
  owner_id UUID;
  avg_rating NUMERIC;
  rating_count INTEGER;
BEGIN
  -- Get the course owner
  IF TG_OP = 'DELETE' THEN
    SELECT user_id INTO owner_id FROM public.courses WHERE id = OLD.course_id;
  ELSE
    SELECT user_id INTO owner_id FROM public.courses WHERE id = NEW.course_id;
  END IF;

  -- If no owner found, exit
  IF owner_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Calculate average rating and count for all courses owned by this user
  SELECT 
    COALESCE(AVG(score), 0),
    COUNT(*)
  INTO avg_rating, rating_count
  FROM public.course_ratings cr
  JOIN public.courses c ON cr.course_id = c.id
  WHERE c.user_id = owner_id;

  -- Update the owner's reputation score
  UPDATE public.profiles
  SET reputation_score = ROUND(avg_rating::numeric, 2)
  WHERE user_id = owner_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_update_owner_reputation ON public.course_ratings;

-- Create trigger to run after insert, update, or delete on course_ratings
CREATE TRIGGER trg_update_owner_reputation
  AFTER INSERT OR UPDATE OR DELETE ON public.course_ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_owner_reputation_from_course_rating();
