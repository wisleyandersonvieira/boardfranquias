-- 1. REVOKE EXECUTE de SECURITY DEFINER functions para anon
REVOKE EXECUTE ON FUNCTION public.can_access_task(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_brand_by_id(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_current_user_matrix_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_next_job_function_code(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_next_product_code() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_next_product_code_by_matrix(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_profile_name(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_store_members(uuid[]) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_matrix_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_store_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_cadastros_write_permission() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_master_user() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_matriz_profile_user() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_matriz_user() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.store_in_user_matrix(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_can_access_task(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_can_access_task_v2(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_has_access_to_account_stores(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_has_access_to_store(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_has_permission(text, permission_type) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_in_same_matrix(uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.can_access_task(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_brand_by_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_matrix_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_job_function_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_product_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_product_code_by_matrix(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_name(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_members(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_matrix_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_store_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_cadastros_write_permission() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_master_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_matriz_profile_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_matriz_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.store_in_user_matrix(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_task(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_task_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_access_to_account_stores(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_access_to_store(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_permission(text, permission_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_in_same_matrix(uuid) TO authenticated;

-- 2. RLS - políticas permissivas
DROP POLICY IF EXISTS "Users can insert account store associations" ON public.current_account_stores;
CREATE POLICY "Users can insert current account store associations"
  ON public.current_account_stores
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_role() = 'admin'
    OR (
      public.store_in_user_matrix(store_id)
      AND public.user_has_access_to_store(store_id)
    )
  );

DROP POLICY IF EXISTS "Authenticated users can view store partners" ON public.store_partners;
CREATE POLICY "Users can view store partners in their matrix"
  ON public.store_partners
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() = 'admin'
    OR public.store_in_user_matrix(store_id)
  );

-- 3. Storage - bucket attachments privado e policies idempotentes
UPDATE storage.buckets SET public = false WHERE id = 'attachments';

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view attachments" ON storage.objects;
DROP POLICY IF EXISTS "Public can read attachments" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can read attachments" ON storage.objects;
CREATE POLICY "Authenticated users can read attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'attachments');

DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'attachments');

DROP POLICY IF EXISTS "Authenticated users can update attachments" ON storage.objects;
CREATE POLICY "Authenticated users can update attachments"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'attachments');

DROP POLICY IF EXISTS "Authenticated users can delete attachments" ON storage.objects;
CREATE POLICY "Authenticated users can delete attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'attachments');

DROP POLICY IF EXISTS "Anyone can upload logo" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update logo" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete logo" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can upload logo" ON storage.objects;
CREATE POLICY "Authenticated users can upload logo"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'logo');

DROP POLICY IF EXISTS "Authenticated users can update logo" ON storage.objects;
CREATE POLICY "Authenticated users can update logo"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'logo');

DROP POLICY IF EXISTS "Authenticated users can delete logo" ON storage.objects;
CREATE POLICY "Authenticated users can delete logo"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'logo');