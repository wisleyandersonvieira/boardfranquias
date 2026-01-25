-- Remover política permissiva antiga que permite acesso a todos
DROP POLICY IF EXISTS "Users can manage products" ON public.products;