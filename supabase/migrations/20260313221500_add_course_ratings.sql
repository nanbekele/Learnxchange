CREATE TABLE IF NOT EXISTS public.course_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  rater_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (course_id, rater_id)
);

ALTER TABLE public.course_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Course ratings are viewable by everyone" ON public.course_ratings
FOR SELECT USING (true);

CREATE POLICY "Users can rate courses they acquired" ON public.course_ratings
FOR INSERT
WITH CHECK (
  auth.uid() = rater_id
  AND NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.user_id = auth.uid())
  AND (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.course_id = course_id
        AND t.buyer_id = auth.uid()
        AND t.status = 'completed'
    )
    OR EXISTS (
      SELECT 1 FROM public.exchanges e
      WHERE e.status = 'accepted'
        AND (
          (e.requester_id = auth.uid() AND (e.requested_course_id = course_id OR e.offered_course_id = course_id))
          OR (e.owner_id = auth.uid() AND (e.requested_course_id = course_id OR e.offered_course_id = course_id))
        )
    )
  )
);

CREATE POLICY "Users can update own course rating" ON public.course_ratings
FOR UPDATE
USING (auth.uid() = rater_id);

CREATE POLICY "Users can delete own course rating" ON public.course_ratings
FOR DELETE
USING (auth.uid() = rater_id);

CREATE TRIGGER update_course_ratings_updated_at
  BEFORE UPDATE ON public.course_ratings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
