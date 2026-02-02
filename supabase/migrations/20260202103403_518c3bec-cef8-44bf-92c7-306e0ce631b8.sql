-- Create the attachments bucket for service orders
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for the attachments bucket
CREATE POLICY "Authenticated users can upload attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'attachments');

CREATE POLICY "Authenticated users can view attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'attachments');

CREATE POLICY "Authenticated users can update their attachments"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'attachments');

CREATE POLICY "Authenticated users can delete attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'attachments');