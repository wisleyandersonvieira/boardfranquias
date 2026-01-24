-- Garantir que authenticated tem permissões na tabela tasks
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;

-- Também garantir permissões nas tabelas relacionadas
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_columns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_stores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_checklist_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_activities TO authenticated;