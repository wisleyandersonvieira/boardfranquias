-- Create function to get user's matrix_id
CREATE OR REPLACE FUNCTION public.get_user_matrix_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT matrix_id FROM public.profiles WHERE id = auth.uid()
$$;