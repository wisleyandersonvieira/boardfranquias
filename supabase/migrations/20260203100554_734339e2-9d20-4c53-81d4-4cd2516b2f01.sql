
-- Drop existing policies on transfers table
DROP POLICY IF EXISTS "Users can view transfers for their store" ON public.transfers;
DROP POLICY IF EXISTS "Users can create transfers for their store" ON public.transfers;
DROP POLICY IF EXISTS "Users can update transfers for their store" ON public.transfers;
DROP POLICY IF EXISTS "Users can delete transfers for their store" ON public.transfers;

-- Recreate policies with proper admin check
CREATE POLICY "Users can view transfers for their store" 
ON public.transfers 
FOR SELECT 
USING (
  user_has_permission('financeiro'::text, 'read'::permission_type) 
  AND (
    get_user_role() = 'admin'::user_role 
    OR user_has_access_to_store(store_id)
  )
);

CREATE POLICY "Users can create transfers for their store" 
ON public.transfers 
FOR INSERT 
WITH CHECK (
  user_has_permission('financeiro'::text, 'write'::permission_type) 
  AND (
    get_user_role() = 'admin'::user_role 
    OR user_has_access_to_store(store_id)
  )
  AND created_by = auth.uid()
);

CREATE POLICY "Users can update transfers for their store" 
ON public.transfers 
FOR UPDATE 
USING (
  user_has_permission('financeiro'::text, 'write'::permission_type) 
  AND (
    get_user_role() = 'admin'::user_role 
    OR user_has_access_to_store(store_id)
  )
);

CREATE POLICY "Users can delete transfers for their store" 
ON public.transfers 
FOR DELETE 
USING (
  user_has_permission('financeiro'::text, 'write'::permission_type) 
  AND (
    get_user_role() = 'admin'::user_role 
    OR user_has_access_to_store(store_id)
  )
);
