-- Add matrix_id column to stores table
ALTER TABLE public.stores ADD COLUMN matrix_id uuid REFERENCES public.matrices(id);

-- Update existing stores to use matrix with code = 1 (Matriz 1)
UPDATE public.stores 
SET matrix_id = (SELECT id FROM public.matrices WHERE code = 1 LIMIT 1)
WHERE matrix_id IS NULL;

-- Make matrix_id NOT NULL after populating existing data
ALTER TABLE public.stores ALTER COLUMN matrix_id SET NOT NULL;

-- Create index for better query performance
CREATE INDEX idx_stores_matrix_id ON public.stores(matrix_id);