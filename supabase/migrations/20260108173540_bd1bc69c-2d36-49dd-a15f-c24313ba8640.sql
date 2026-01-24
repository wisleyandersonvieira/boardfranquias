-- Recriar política de INSERT mais permissiva
DROP POLICY IF EXISTS "Anyone can create tasks" ON public.tasks;

-- Política que permite insert para qualquer usuário autenticado
-- O WITH CHECK garante que created_by seja o próprio usuário
CREATE POLICY "Anyone can create tasks"
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (true);