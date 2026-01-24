-- Drop existing policies
DROP POLICY IF EXISTS "Users can create transfers for their store" ON public.transfers;
DROP POLICY IF EXISTS "Users can view transfers for their store" ON public.transfers;
DROP POLICY IF EXISTS "Users can update transfers for their store" ON public.transfers;
DROP POLICY IF EXISTS "Users can delete transfers for their store" ON public.transfers;

-- Create new policies using user_has_access_to_store for multi-store support
CREATE POLICY "Users can create transfers for their store" 
ON public.transfers 
FOR INSERT 
WITH CHECK (
  user_has_permission('financeiro', 'write') 
  AND user_has_access_to_store(store_id)
  AND created_by = auth.uid()
);

CREATE POLICY "Users can view transfers for their store" 
ON public.transfers 
FOR SELECT 
USING (
  user_has_permission('financeiro', 'read') 
  AND user_has_access_to_store(store_id)
);

CREATE POLICY "Users can update transfers for their store" 
ON public.transfers 
FOR UPDATE 
USING (
  user_has_permission('financeiro', 'write') 
  AND user_has_access_to_store(store_id)
);

CREATE POLICY "Users can delete transfers for their store" 
ON public.transfers 
FOR DELETE 
USING (
  user_has_permission('financeiro', 'write') 
  AND user_has_access_to_store(store_id)
);