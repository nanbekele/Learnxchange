ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS toc_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('course-tocs', 'course-tocs', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Course TOCs are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload course TOCs" ON storage.objects;
DROP POLICY IF EXISTS "Users can update course TOCs" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete course TOCs" ON storage.objects;

CREATE POLICY "Course TOCs are publicly accessible" ON storage.objects
FOR SELECT
USING (bucket_id = 'course-tocs');

CREATE POLICY "Users can upload course TOCs" ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'course-tocs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update course TOCs" ON storage.objects
FOR UPDATE
USING (bucket_id = 'course-tocs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete course TOCs" ON storage.objects
FOR DELETE
USING (bucket_id = 'course-tocs' AND auth.uid()::text = (storage.foldername(name))[1]);
