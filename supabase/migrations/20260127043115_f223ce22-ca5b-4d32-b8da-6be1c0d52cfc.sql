-- Add brand_id column to dre_structures table
ALTER TABLE public.dre_structures 
ADD COLUMN brand_id uuid REFERENCES public.brands(id);

-- Update existing structures with GELA BOCA brand
UPDATE public.dre_structures 
SET brand_id = '0d178a05-c398-4149-a9ca-b02fcf074dde';

-- Make brand_id NOT NULL after populating existing records
ALTER TABLE public.dre_structures 
ALTER COLUMN brand_id SET NOT NULL;

-- Create index for better query performance
CREATE INDEX idx_dre_structures_brand_id ON public.dre_structures(brand_id);