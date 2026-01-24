-- Reativar RLS e criar políticas corretas

-- 1. Reativar RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- 2. Remover todas as políticas existentes
DROP POLICY IF EXISTS "Users can insert own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Authenticated users can create tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can view tasks with shared stores" ON public.tasks;
DROP POLICY IF EXISTS "Users with access can update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Task creator can delete" ON public.tasks;

-- 3. Criar função helper para verificar acesso à tarefa
CREATE OR REPLACE FUNCTION public.user_can_access_task_v2(p_task_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin tem acesso a tudo
  IF get_user_role() = 'admin' THEN
    RETURN TRUE;
  END IF;
  
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

-- 4. Política de SELECT - pode ver tarefas que tem acesso
CREATE POLICY "Users can view accessible tasks"
ON public.tasks
FOR SELECT
TO authenticated
USING (public.user_can_access_task_v2(id));

-- 5. Política de INSERT - qualquer usuário autenticado pode criar
CREATE POLICY "Authenticated users can create tasks"
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

-- 6. Política de UPDATE - pode atualizar tarefas que tem acesso
CREATE POLICY "Users can update accessible tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (public.user_can_access_task_v2(id));

-- 7. Política de DELETE - criador ou admin pode deletar
CREATE POLICY "Creator or admin can delete tasks"
ON public.tasks
FOR DELETE
TO authenticated
USING (auth.uid() = created_by OR get_user_role() = 'admin');