-- Fix 403 Forbidden when creating courses
-- Missing grants for courses and course_materials tables

-- courses: users need SELECT (view), INSERT (create), UPDATE (edit), DELETE (remove)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;

-- course_materials: users need SELECT (view), INSERT (add), DELETE (remove)
GRANT SELECT, INSERT, DELETE ON public.course_materials TO authenticated;

-- Also ensure schema usage is granted
GRANT USAGE ON SCHEMA public TO authenticated;
