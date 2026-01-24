-- Remover políticas existentes do bucket obligation-attachments
DROP POLICY IF EXISTS "Users can upload obligation attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can view obligation attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete obligation attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload obligation attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view obligation attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete obligation attachments" ON storage.objects;

-- Criar políticas para o bucket obligation-attachments
-- Permitir upload para usuários autenticados que têm acesso à loja
CREATE POLICY "Users can upload to obligation-attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'obligation-attachments'
  AND (
    public.get_user_role() = 'admin'
    OR public.user_has_access_to_store((storage.foldername(name))[1]::uuid)
    OR (storage.foldername(name))[1]::uuid = public.get_user_store_id()
  )
);

-- Permitir visualização para usuários autenticados que têm acesso à loja
CREATE POLICY "Users can view obligation-attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'obligation-attachments'
  AND (
    public.get_user_role() = 'admin'
    OR public.user_has_access_to_store((storage.foldername(name))[1]::uuid)
    OR (storage.foldername(name))[1]::uuid = public.get_user_store_id()
  )
);

-- Permitir atualização para usuários autenticados que têm acesso à loja
CREATE POLICY "Users can update obligation-attachments"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'obligation-attachments'
  AND (
    public.get_user_role() = 'admin'
    OR public.user_has_access_to_store((storage.foldername(name))[1]::uuid)
    OR (storage.foldername(name))[1]::uuid = public.get_user_store_id()
  )
);

-- Permitir exclusão para usuários autenticados que têm acesso à loja
CREATE POLICY "Users can delete from obligation-attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'obligation-attachments'
  AND (
    public.get_user_role() = 'admin'
    OR public.user_has_access_to_store((storage.foldername(name))[1]::uuid)
    OR (storage.foldername(name))[1]::uuid = public.get_user_store_id()
  )
);