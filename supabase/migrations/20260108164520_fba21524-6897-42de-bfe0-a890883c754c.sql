-- Remover políticas existentes de task_stores
DROP POLICY IF EXISTS "Users can view task stores with access" ON public.task_stores;
DROP POLICY IF EXISTS "Users with access can manage task stores" ON public.task_stores;

-- Criar políticas corrigidas para task_stores

-- SELECT: usuários podem ver task_stores de tarefas que têm acesso
CREATE POLICY "Users can view task stores with access"
ON public.task_stores
FOR SELECT
USING (
  -- Admin pode ver tudo
  get_user_role() = 'admin'
  OR
  -- Criador da tarefa pode ver
  EXISTS (
    SELECT 1 FROM public.tasks 
    WHERE tasks.id = task_stores.task_id 
    AND tasks.created_by = auth.uid()
  )
  OR
  -- Usuário com loja em comum pode ver
  EXISTS (
    SELECT 1 FROM public.user_stores us
    WHERE us.user_id = auth.uid()
    AND us.store_id = task_stores.store_id
  )
);

-- INSERT: usuários autenticados podem inserir se forem o criador da tarefa ou admin
CREATE POLICY "Users can insert task stores"
ON public.task_stores
FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated'
  AND (
    -- Admin pode inserir em qualquer tarefa
    get_user_role() = 'admin'
    OR
    -- Criador da tarefa pode inserir lojas
    EXISTS (
      SELECT 1 FROM public.tasks 
      WHERE tasks.id = task_id 
      AND tasks.created_by = auth.uid()
    )
    OR
    -- Usuário com acesso à tarefa pode inserir
    user_can_access_task(task_id)
  )
);

-- UPDATE: usuários podem atualizar se tiverem acesso à tarefa
CREATE POLICY "Users can update task stores"
ON public.task_stores
FOR UPDATE
USING (
  get_user_role() = 'admin'
  OR
  EXISTS (
    SELECT 1 FROM public.tasks 
    WHERE tasks.id = task_stores.task_id 
    AND tasks.created_by = auth.uid()
  )
  OR
  user_can_access_task(task_id)
);

-- DELETE: usuários podem deletar se tiverem acesso à tarefa
CREATE POLICY "Users can delete task stores"
ON public.task_stores
FOR DELETE
USING (
  get_user_role() = 'admin'
  OR
  EXISTS (
    SELECT 1 FROM public.tasks 
    WHERE tasks.id = task_stores.task_id 
    AND tasks.created_by = auth.uid()
  )
  OR
  user_can_access_task(task_id)
);