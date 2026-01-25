-- Remove políticas antigas que permitem acesso irrestrito
DROP POLICY IF EXISTS "Users can view all suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Users can create suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Users can update suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Users can delete suppliers" ON public.suppliers;