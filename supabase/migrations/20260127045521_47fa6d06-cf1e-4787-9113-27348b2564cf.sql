-- Add matrix_id column to task_columns table
ALTER TABLE public.task_columns 
ADD COLUMN matrix_id uuid REFERENCES public.matrices(id);

-- Backfill existing columns with Premier matrix (id: 939e9256-75ff-44ad-b1d5-00ed39b30362)
UPDATE public.task_columns 
SET matrix_id = '939e9256-75ff-44ad-b1d5-00ed39b30362';

-- Make matrix_id required after backfill
ALTER TABLE public.task_columns 
ALTER COLUMN matrix_id SET NOT NULL;

-- Create index for performance
CREATE INDEX idx_task_columns_matrix_id ON public.task_columns(matrix_id);