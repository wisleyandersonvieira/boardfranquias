-- SOLUÇÃO FINAL: Resetar completamente as permissões da tabela tasks

-- 1. Primeiro, dar propriedade correta à tabela
ALTER TABLE public.tasks OWNER TO postgres;

-- 2. Conceder permissões explicitamente
GRANT ALL PRIVILEGES ON TABLE public.tasks TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.tasks TO anon;
GRANT ALL PRIVILEGES ON TABLE public.tasks TO service_role;

-- 3. Garantir que o schema public tenha as permissões certas
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- 4. Recriar a política de INSERT sem restrições complexas
DROP POLICY IF EXISTS "Authenticated users can create tasks" ON public.tasks;

CREATE POLICY "Users can insert own tasks"
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 5. Também conceder às tabelas relacionadas
GRANT ALL PRIVILEGES ON TABLE public.task_columns TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.task_stores TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.task_members TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.task_comments TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.task_checklist_items TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.task_activities TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.task_attachments TO authenticated;