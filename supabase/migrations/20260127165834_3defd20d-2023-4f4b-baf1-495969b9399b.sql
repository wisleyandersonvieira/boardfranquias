-- Add matrix_id column to job_functions table
ALTER TABLE public.job_functions
ADD COLUMN matrix_id uuid REFERENCES public.matrices(id);

-- Update existing records to use Premier matrix
UPDATE public.job_functions
SET matrix_id = '939e9256-75ff-44ad-b1d5-00ed39b30362'
WHERE matrix_id IS NULL;

-- Make matrix_id NOT NULL after updating existing records
ALTER TABLE public.job_functions
ALTER COLUMN matrix_id SET NOT NULL;

-- Create index for performance
CREATE INDEX idx_job_functions_matrix_id ON public.job_functions(matrix_id);

-- Drop existing RLS policies if any
DROP POLICY IF EXISTS "Users can view job functions" ON public.job_functions;
DROP POLICY IF EXISTS "Users can insert job functions" ON public.job_functions;
DROP POLICY IF EXISTS "Users can update job functions" ON public.job_functions;
DROP POLICY IF EXISTS "Users can delete job functions" ON public.job_functions;

-- Enable RLS
ALTER TABLE public.job_functions ENABLE ROW LEVEL SECURITY;

-- Create new RLS policies with matrix isolation
CREATE POLICY "Users can view job functions for their matrix"
ON public.job_functions
FOR SELECT
USING (matrix_id = get_user_matrix_id());

CREATE POLICY "Users can insert job functions for their matrix"
ON public.job_functions
FOR INSERT
WITH CHECK (matrix_id = get_user_matrix_id() AND user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can update job functions for their matrix"
ON public.job_functions
FOR UPDATE
USING (matrix_id = get_user_matrix_id() AND user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can delete job functions for their matrix"
ON public.job_functions
FOR DELETE
USING (matrix_id = get_user_matrix_id() AND user_has_permission('cadastros', 'write'));