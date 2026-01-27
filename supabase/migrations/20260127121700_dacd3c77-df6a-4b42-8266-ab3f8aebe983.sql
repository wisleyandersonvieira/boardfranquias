-- Drop existing policy for Matriz users
DROP POLICY IF EXISTS "Matriz users can manage user stores in their matrix" ON public.user_stores;

-- Create updated policy that allows Matriz users to insert when the store belongs to their matrix
-- The user_in_same_matrix check is relaxed for INSERT since the new user might not have matrix_id set yet
CREATE POLICY "Matriz users can manage user stores in their matrix"
ON public.user_stores
FOR ALL
USING (
  is_matriz_user() AND (
    user_in_same_matrix(user_id) OR 
    store_in_user_matrix(store_id)
  )
)
WITH CHECK (
  is_matriz_user() AND store_in_user_matrix(store_id)
);