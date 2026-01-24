-- Add sequential code column to matrices table
ALTER TABLE public.matrices 
ADD COLUMN code SERIAL NOT NULL;

-- Create unique index on code
CREATE UNIQUE INDEX idx_matrices_code ON public.matrices(code);

-- Update existing records if any (set code based on creation order)
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
  FROM public.matrices
)
UPDATE public.matrices m
SET code = n.rn
FROM numbered n
WHERE m.id = n.id;