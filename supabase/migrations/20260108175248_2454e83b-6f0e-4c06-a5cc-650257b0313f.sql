-- Remover e recriar política de INSERT
DROP POLICY IF EXISTS "Authenticated users can create tasks" ON public.tasks;

-- Criar política de INSERT com USING e WITH CHECK
CREATE POLICY "Authenticated users can create tasks"
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
);