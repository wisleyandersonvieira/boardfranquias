-- Add matrix_id column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN matrix_id uuid REFERENCES public.matrices(id);

-- Update existing users to link to matrix with code 1
UPDATE public.profiles p
SET matrix_id = (SELECT id FROM public.matrices WHERE code = 1 LIMIT 1)
WHERE matrix_id IS NULL;

-- Make matrix_id NOT NULL after updating existing records
-- (only if there are matrices in the system)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.matrices LIMIT 1) THEN
    ALTER TABLE public.profiles ALTER COLUMN matrix_id SET NOT NULL;
  END IF;
END $$;

-- Create index for better performance
CREATE INDEX idx_profiles_matrix_id ON public.profiles(matrix_id);