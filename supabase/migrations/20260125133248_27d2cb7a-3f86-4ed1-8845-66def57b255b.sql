-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage stores" ON public.stores;
DROP POLICY IF EXISTS "Users can view all stores" ON public.stores;

-- Create new policies for stores with matrix isolation
-- SELECT: Users can only view stores from their matrix
CREATE POLICY "Users can view stores for their matrix"
ON public.stores
FOR SELECT
USING (matrix_id = get_user_matrix_id());

-- INSERT: Users with cadastros write permission can insert stores for their matrix
CREATE POLICY "Users can insert stores for their matrix"
ON public.stores
FOR INSERT
WITH CHECK (
  (matrix_id = get_user_matrix_id()) AND 
  user_has_permission('cadastros'::text, 'write'::permission_type)
);

-- UPDATE: Users with cadastros write permission can update stores for their matrix
CREATE POLICY "Users can update stores for their matrix"
ON public.stores
FOR UPDATE
USING (
  (matrix_id = get_user_matrix_id()) AND 
  user_has_permission('cadastros'::text, 'write'::permission_type)
);

-- DELETE: Users with cadastros write permission can delete stores for their matrix
CREATE POLICY "Users can delete stores for their matrix"
ON public.stores
FOR DELETE
USING (
  (matrix_id = get_user_matrix_id()) AND 
  user_has_permission('cadastros'::text, 'write'::permission_type)
);