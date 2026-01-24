-- Remover as políticas anteriores
DROP POLICY IF EXISTS "Users can upload to obligation-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can view obligation-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can update obligation-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete from obligation-attachments" ON storage.objects;

-- Criar políticas mais simples para authenticated users no bucket obligation-attachments
CREATE POLICY "Authenticated users can upload to obligation-attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'obligation-attachments');

CREATE POLICY "Authenticated users can view obligation-attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'obligation-attachments');

CREATE POLICY "Authenticated users can update obligation-attachments"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'obligation-attachments');

CREATE POLICY "Authenticated users can delete from obligation-attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'obligation-attachments');