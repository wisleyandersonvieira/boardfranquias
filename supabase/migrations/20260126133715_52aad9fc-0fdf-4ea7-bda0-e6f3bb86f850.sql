-- Add brand_id column to account_groups table
ALTER TABLE public.account_groups
ADD COLUMN brand_id UUID REFERENCES public.brands(id);

-- Update existing groups to link to Gela Boca brand
UPDATE public.account_groups
SET brand_id = '0d178a05-c398-4149-a9ca-b02fcf074dde'
WHERE brand_id IS NULL;