-- SOLUÇÃO DEFINITIVA: Garantir todas as permissões para a tabela tasks

-- 1. Conceder todas as permissões necessárias para o role authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO anon;

-- 2. Também garantir que o sequence/id funcione (se usar serial/bigserial)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;

-- 3. Recriar a política de INSERT de forma mais simples e direta
DROP POLICY IF EXISTS "Authenticated users can create tasks" ON public.tasks;

CREATE POLICY "Authenticated users can create tasks"
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

-- 4. Garantir que as tabelas relacionadas também tenham grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_columns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_stores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_checklist_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_activities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_attachments TO authenticated;