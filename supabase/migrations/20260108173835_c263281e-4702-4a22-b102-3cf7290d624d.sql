-- Remover a foreign key para auth.users que pode estar causando o problema
ALTER TABLE public.tasks 
DROP CONSTRAINT IF EXISTS tasks_created_by_fkey;

-- Adicionar foreign key para profiles ao invés de auth.users
ALTER TABLE public.tasks 
ADD CONSTRAINT tasks_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE CASCADE;