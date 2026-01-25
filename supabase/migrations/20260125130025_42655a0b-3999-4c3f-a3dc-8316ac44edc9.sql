-- Add matrix_id column to suppliers table
ALTER TABLE public.suppliers 
ADD COLUMN matrix_id uuid REFERENCES public.matrices(id);

-- Set existing records to matrix code 1
UPDATE public.suppliers 
SET matrix_id = (SELECT id FROM public.matrices WHERE code = 1 LIMIT 1)
WHERE matrix_id IS NULL;

-- Make matrix_id NOT NULL after setting defaults
ALTER TABLE public.suppliers 
ALTER COLUMN matrix_id SET NOT NULL;

-- Create index for performance
CREATE INDEX idx_suppliers_matrix_id ON public.suppliers(matrix_id);

-- Drop existing RLS policies on suppliers
DROP POLICY IF EXISTS "Users can view suppliers for their stores" ON public.suppliers;
DROP POLICY IF EXISTS "Users can create suppliers for their stores" ON public.suppliers;
DROP POLICY IF EXISTS "Users can update suppliers for their stores" ON public.suppliers;
DROP POLICY IF EXISTS "Users can delete suppliers for their stores" ON public.suppliers;

-- Create new RLS policies based on matrix
CREATE POLICY "Users can view suppliers for their matrix"
ON public.suppliers
FOR SELECT
USING (matrix_id = get_user_matrix_id());

CREATE POLICY "Users can insert suppliers for their matrix"
ON public.suppliers
FOR INSERT
WITH CHECK (
  matrix_id = get_user_matrix_id() 
  AND user_has_permission('cadastros', 'write')
);

CREATE POLICY "Users can update suppliers for their matrix"
ON public.suppliers
FOR UPDATE
USING (
  matrix_id = get_user_matrix_id() 
  AND user_has_permission('cadastros', 'write')
);

CREATE POLICY "Users can delete suppliers for their matrix"
ON public.suppliers
FOR DELETE
USING (
  matrix_id = get_user_matrix_id() 
  AND user_has_permission('cadastros', 'write')
);