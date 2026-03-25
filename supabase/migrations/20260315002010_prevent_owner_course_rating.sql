-- Prevent course owners from rating/updating ratings on their own courses (defense-in-depth)

DROP POLICY IF EXISTS "Users can update own course rating" ON public.course_ratings;

CREATE POLICY "Users can update own course rating" ON public.course_ratings
FOR UPDATE
USING (
  auth.uid() = rater_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.courses c
    WHERE c.id = course_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = rater_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.courses c
    WHERE c.id = course_id
      AND c.user_id = auth.uid()
  )
);
