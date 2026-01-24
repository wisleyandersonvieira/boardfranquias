-- Remover políticas existentes e criar novas simplificadas

-- 1. Remover todas as políticas existentes
DROP POLICY IF EXISTS "Users can view accessible tasks" ON public.tasks;
DROP POLICY IF EXISTS "Authenticated users can create tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can update accessible tasks" ON public.tasks;
DROP POLICY IF EXISTS "Creator or admin can delete tasks" ON public.tasks;

-- 2. Atualizar função helper (sem verificação de admin)
CREATE OR REPLACE FUNCTION public.user_can_access_task_v2(p_task_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Criador tem acesso
  IF EXISTS (SELECT 1 FROM tasks WHERE id = p_task_id AND created_by = auth.uid()) THEN
    RETURN TRUE;
  END IF;
  
  -- Membro da tarefa tem acesso
  IF EXISTS (SELECT 1 FROM task_members WHERE task_id = p_task_id AND user_id = auth.uid()) THEN
    RETURN TRUE;
  END IF;
  
  -- Usuário com acesso a uma loja da tarefa tem acesso
  IF EXISTS (
    SELECT 1 
    FROM task_stores ts
    JOIN user_stores us ON ts.store_id = us.store_id
    WHERE ts.task_id = p_task_id AND us.user_id = auth.uid()
  ) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;

-- 3. Política de INSERT - qualquer usuário autenticado pode criar
CREATE POLICY "Anyone can create tasks"
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

-- 4. Política de SELECT - criador, membro ou loja vinculada
CREATE POLICY "Users can view accessible tasks"
ON public.tasks
FOR SELECT
TO authenticated
USING (public.user_can_access_task_v2(id));

-- 5. Política de UPDATE - mesma regra do SELECT
CREATE POLICY "Users can update accessible tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (public.user_can_access_task_v2(id));

-- 6. Política de DELETE - criador pode deletar
CREATE POLICY "Creator can delete tasks"
ON public.tasks
FOR DELETE
TO authenticated
USING (auth.uid() = created_by);