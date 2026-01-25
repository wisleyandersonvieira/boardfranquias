-- Drop the existing unique constraint on code (global uniqueness)
ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_code_key;

-- Create a new unique constraint that allows same code in different matrices
-- Code must be unique only within the same matrix
CREATE UNIQUE INDEX idx_stores_code_matrix ON public.stores(code, matrix_id);