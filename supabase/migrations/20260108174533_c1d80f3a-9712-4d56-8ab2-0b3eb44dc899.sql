-- Remover políticas atuais que causam recursão
DROP POLICY IF EXISTS "Users can view tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can update tasks" ON public.tasks;

-- Criar função SECURITY DEFINER para verificar acesso (evita recursão)
CREATE OR REPLACE FUNCTION public.can_access_task(p_task_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_created_by uuid;
BEGIN
  -- Buscar o criador da tarefa diretamente (sem RLS)
  SELECT created_by INTO v_created_by FROM tasks WHERE id = p_task_id;
  
  -- Criador tem acesso
  IF v_created_by = auth.uid() THEN
    RETURN TRUE;
  END IF;
  
  -- Membro da tarefa tem acesso
  IF EXISTS (SELECT 1 FROM task_members WHERE task_id = p_task_id AND user_id = auth.uid()) THEN
    RETURN TRUE;
  END IF;
  
  -- Usuário com acesso a uma loja da tarefa tem acesso
  IF EXISTS (
    SELECT 1 FROM task_stores ts
    JOIN user_stores us ON ts.store_id = us.store_id
    WHERE ts.task_id = p_task_id AND us.user_id = auth.uid()
  ) THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$;

-- Recriar políticas usando a função
CREATE POLICY "Users can view tasks"
ON public.tasks
FOR SELECT
TO authenticated
USING (public.can_access_task(id));

CREATE POLICY "Users can update tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (public.can_access_task(id));