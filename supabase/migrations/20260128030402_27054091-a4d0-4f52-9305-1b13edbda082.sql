-- Add matrix_id column to system_parameters table
ALTER TABLE public.system_parameters 
ADD COLUMN matrix_id uuid REFERENCES public.matrices(id);

-- Create index for performance
CREATE INDEX idx_system_parameters_matrix_id ON public.system_parameters(matrix_id);

-- Migrate existing records to Premier matrix
UPDATE public.system_parameters 
SET matrix_id = '939e9256-75ff-44ad-b1d5-00ed39b30362' 
WHERE matrix_id IS NULL;

-- Make matrix_id NOT NULL after migration
ALTER TABLE public.system_parameters 
ALTER COLUMN matrix_id SET NOT NULL;

-- Drop existing RLS policies that might conflict
DROP POLICY IF EXISTS "Admins can manage system parameters" ON public.system_parameters;
DROP POLICY IF EXISTS "All users can view system parameters" ON public.system_parameters;
DROP POLICY IF EXISTS "Users can view system parameters" ON public.system_parameters;
DROP POLICY IF EXISTS "Users can manage system parameters" ON public.system_parameters;

-- Create new matrix-based RLS policies
-- Only Matriz profile users and master user can view parameters for their matrix
CREATE POLICY "Users can view parameters for their matrix"
ON public.system_parameters FOR SELECT
USING (
  matrix_id = get_user_matrix_id()
  AND (
    is_matriz_profile_user()
    OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'wisley_anderson@hotmail.com'
  )
);

-- Only Matriz profile users and master user can insert parameters
CREATE POLICY "Users can insert parameters for their matrix"
ON public.system_parameters FOR INSERT
WITH CHECK (
  matrix_id = get_user_matrix_id()
  AND (
    is_matriz_profile_user()
    OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'wisley_anderson@hotmail.com'
  )
);

-- Only Matriz profile users and master user can update parameters
CREATE POLICY "Users can update parameters for their matrix"
ON public.system_parameters FOR UPDATE
USING (
  matrix_id = get_user_matrix_id()
  AND (
    is_matriz_profile_user()
    OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'wisley_anderson@hotmail.com'
  )
);

-- Only Matriz profile users and master user can delete parameters
CREATE POLICY "Users can delete parameters for their matrix"
ON public.system_parameters FOR DELETE
USING (
  matrix_id = get_user_matrix_id()
  AND (
    is_matriz_profile_user()
    OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'wisley_anderson@hotmail.com'
  )
);