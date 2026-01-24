-- Drop existing insert policy
DROP POLICY IF EXISTS "Admins can insert matrices" ON public.matrices;

-- Create new insert policy for master user only
CREATE POLICY "Master user can insert matrices"
ON public.matrices
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND email = 'wisley_anderson@hotmail.com'
  )
);

-- Update delete policy to master user only
DROP POLICY IF EXISTS "Admins can delete matrices" ON public.matrices;

CREATE POLICY "Master user can delete matrices"
ON public.matrices
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND email = 'wisley_anderson@hotmail.com'
  )
);