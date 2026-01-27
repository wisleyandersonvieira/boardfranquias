-- Create a function to check if user has "Matriz" profile and get their matrix_id
CREATE OR REPLACE FUNCTION public.is_matriz_profile_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_profiles up ON p.profile_id = up.id
    WHERE p.id = auth.uid()
      AND up.name = 'Matriz'
  )
$$;

-- Create a function to get current user's matrix_id
CREATE OR REPLACE FUNCTION public.get_current_user_matrix_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT matrix_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Add policy for Matriz profile users to view all profiles in their matrix
CREATE POLICY "Matriz users can view profiles in their matrix"
ON public.profiles
FOR SELECT
USING (
  is_matriz_profile_user() AND matrix_id = get_current_user_matrix_id()
);

-- Add policy for Matriz profile users to update profiles in their matrix
CREATE POLICY "Matriz users can update profiles in their matrix"
ON public.profiles
FOR UPDATE
USING (
  is_matriz_profile_user() AND matrix_id = get_current_user_matrix_id()
);