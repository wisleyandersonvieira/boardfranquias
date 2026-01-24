-- Remover a política existente
DROP POLICY IF EXISTS "Authenticated users can create tasks" ON public.tasks;

-- Criar uma política mais simples que funciona para qualquer usuário autenticado
CREATE POLICY "Authenticated users can create tasks"
ON public.tasks
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND auth.uid() = created_by
);