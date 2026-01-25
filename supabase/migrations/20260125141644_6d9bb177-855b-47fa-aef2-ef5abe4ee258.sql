-- Remover políticas permissivas antigas que permitem acesso global
DROP POLICY IF EXISTS "Users can manage units of measure" ON public.units_of_measure;
DROP POLICY IF EXISTS "Users can view units of measure" ON public.units_of_measure;