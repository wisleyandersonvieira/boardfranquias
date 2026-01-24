-- Remover políticas antigas de checklist
DROP POLICY IF EXISTS "Users can view checklist items with access" ON public.task_checklist_items;
DROP POLICY IF EXISTS "Users with access can manage checklist items" ON public.task_checklist_items;

-- Criar políticas simples para checklist - usuários autenticados
CREATE POLICY "Authenticated users can view checklist items"
ON public.task_checklist_items
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create checklist items"
ON public.task_checklist_items
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update checklist items"
ON public.task_checklist_items
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete checklist items"
ON public.task_checklist_items
FOR DELETE
TO authenticated
USING (true);

-- Remover políticas antigas de comentários
DROP POLICY IF EXISTS "Users can view comments with access" ON public.task_comments;
DROP POLICY IF EXISTS "Users with access can create comments" ON public.task_comments;
DROP POLICY IF EXISTS "Comment author can update" ON public.task_comments;
DROP POLICY IF EXISTS "Comment author can delete" ON public.task_comments;

-- Criar políticas simples para comentários
CREATE POLICY "Authenticated users can view comments"
ON public.task_comments
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create comments"
ON public.task_comments
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Comment authors can update"
ON public.task_comments
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Comment authors can delete"
ON public.task_comments
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);