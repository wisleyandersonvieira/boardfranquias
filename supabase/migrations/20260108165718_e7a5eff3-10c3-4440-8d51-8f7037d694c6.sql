-- Remover a política existente
DROP POLICY IF EXISTS "Authenticated users can create tasks" ON public.tasks;

-- Recriar a política para funcionar com role public (como as outras policies)
CREATE POLICY "Authenticated users can create tasks"
ON public.tasks
FOR INSERT
TO public
WITH CHECK (
  auth.role() = 'authenticated' 
  AND auth.uid() IS NOT NULL 
  AND auth.uid() = created_by
);