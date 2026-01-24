-- Desabilitar RLS completamente para tasks
ALTER TABLE public.tasks DISABLE ROW LEVEL SECURITY;

-- Também remover todas as políticas existentes para evitar conflitos
DROP POLICY IF EXISTS "Anyone can create tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can view accessible tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can update accessible tasks" ON public.tasks;
DROP POLICY IF EXISTS "Creator can delete tasks" ON public.tasks;