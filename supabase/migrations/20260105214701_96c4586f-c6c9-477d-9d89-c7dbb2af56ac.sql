-- Create table for task attachments
CREATE TABLE public.task_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  content_type TEXT,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

-- Create policies for task attachments
CREATE POLICY "Users can view task attachments" 
ON public.task_attachments 
FOR SELECT 
TO authenticated
USING (public.user_can_access_task(task_id));

CREATE POLICY "Users can upload task attachments" 
ON public.task_attachments 
FOR INSERT 
TO authenticated
WITH CHECK (public.user_can_access_task(task_id) AND auth.uid() = uploaded_by);

CREATE POLICY "Users can delete own task attachments" 
ON public.task_attachments 
FOR DELETE 
TO authenticated
USING (auth.uid() = uploaded_by);

-- Create storage bucket for task attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('task-attachments', 'task-attachments', false);

-- Storage policies
CREATE POLICY "Users can view task attachment files" 
ON storage.objects 
FOR SELECT 
TO authenticated
USING (bucket_id = 'task-attachments');

CREATE POLICY "Users can upload task attachment files" 
ON storage.objects 
FOR INSERT 
TO authenticated
WITH CHECK (bucket_id = 'task-attachments');

CREATE POLICY "Users can delete task attachment files" 
ON storage.objects 
FOR DELETE 
TO authenticated
USING (bucket_id = 'task-attachments');