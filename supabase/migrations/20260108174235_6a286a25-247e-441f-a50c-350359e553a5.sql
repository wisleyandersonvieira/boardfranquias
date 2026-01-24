-- Reativar RLS com políticas corretas
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- INSERT: qualquer usuário autenticado pode criar
CREATE POLICY "Authenticated users can create tasks"
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (true);

-- SELECT: criador, membro ou tem loja vinculada
CREATE POLICY "Users can view tasks"
ON public.tasks
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid() 
  OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = tasks.id AND tm.user_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM task_stores ts
    JOIN user_stores us ON ts.store_id = us.store_id
    WHERE ts.task_id = tasks.id AND us.user_id = auth.uid()
  )
);

-- UPDATE: mesma regra do SELECT
CREATE POLICY "Users can update tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid() 
  OR EXISTS (SELECT 1 FROM task_members tm WHERE tm.task_id = tasks.id AND tm.user_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM task_stores ts
    JOIN user_stores us ON ts.store_id = us.store_id
    WHERE ts.task_id = tasks.id AND us.user_id = auth.uid()
  )
);

-- DELETE: criador pode deletar
CREATE POLICY "Creator can delete tasks"
ON public.tasks
FOR DELETE
TO authenticated
USING (created_by = auth.uid());