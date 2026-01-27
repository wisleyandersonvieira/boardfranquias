
-- Add matrix_id column to employee_obligations
ALTER TABLE public.employee_obligations 
ADD COLUMN IF NOT EXISTS matrix_id uuid REFERENCES public.matrices(id);

-- Migrate existing records to Premier matrix (id: 939e9256-75ff-44ad-b1d5-00ed39b30362)
UPDATE public.employee_obligations 
SET matrix_id = '939e9256-75ff-44ad-b1d5-00ed39b30362' 
WHERE matrix_id IS NULL;

-- Make matrix_id NOT NULL after migration
ALTER TABLE public.employee_obligations 
ALTER COLUMN matrix_id SET NOT NULL;

-- Drop old conflicting policies
DROP POLICY IF EXISTS "All users can view all obligations" ON public.employee_obligations;
DROP POLICY IF EXISTS "Admins can manage all obligations" ON public.employee_obligations;
DROP POLICY IF EXISTS "Users can delete obligations for their store" ON public.employee_obligations;
DROP POLICY IF EXISTS "Users can insert obligations for their store" ON public.employee_obligations;
DROP POLICY IF EXISTS "Users can update obligations for their store" ON public.employee_obligations;

-- Create new matrix-based RLS policies
CREATE POLICY "Users can view obligations for their matrix"
ON public.employee_obligations
FOR SELECT
USING (matrix_id = get_user_matrix_id());

CREATE POLICY "Users can insert obligations for their matrix"
ON public.employee_obligations
FOR INSERT
WITH CHECK (matrix_id = get_user_matrix_id() AND has_cadastros_write_permission());

CREATE POLICY "Users can update obligations for their matrix"
ON public.employee_obligations
FOR UPDATE
USING (matrix_id = get_user_matrix_id() AND has_cadastros_write_permission());

CREATE POLICY "Users can delete obligations for their matrix"
ON public.employee_obligations
FOR DELETE
USING (matrix_id = get_user_matrix_id() AND has_cadastros_write_permission());

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_employee_obligations_matrix_id ON public.employee_obligations(matrix_id);
