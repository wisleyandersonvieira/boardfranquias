-- Remover a política existente
DROP POLICY IF EXISTS "Authenticated users can create tasks" ON public.tasks;

-- Recriar a política de forma mais simples
CREATE POLICY "Authenticated users can create tasks"
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);