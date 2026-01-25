-- Add brand_id column to matrices table
ALTER TABLE public.matrices
ADD COLUMN brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL;

-- Create unique constraint to ensure one brand per matrix
ALTER TABLE public.matrices
ADD CONSTRAINT matrices_brand_id_unique UNIQUE (brand_id);

-- Add comment explaining the field behavior
COMMENT ON COLUMN public.matrices.brand_id IS 'Brand linked to this matrix. Once set, cannot be changed.';