
-- Criar função SECURITY DEFINER para verificar se é o usuário mestre
CREATE OR REPLACE FUNCTION public.is_master_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE id = auth.uid()
      AND email = 'wisley_anderson@hotmail.com'
  )
$$;

-- Recriar as políticas usando a nova função
DROP POLICY IF EXISTS "Users can view parameters for their matrix" ON public.system_parameters;
DROP POLICY IF EXISTS "Users can insert parameters for their matrix" ON public.system_parameters;
DROP POLICY IF EXISTS "Users can update parameters for their matrix" ON public.system_parameters;
DROP POLICY IF EXISTS "Users can delete parameters for their matrix" ON public.system_parameters;

-- Política de SELECT
CREATE POLICY "Users can view parameters for their matrix"
ON public.system_parameters
FOR SELECT
USING (
  matrix_id = get_user_matrix_id()
  AND (is_matriz_profile_user() OR is_master_user())
);

-- Política de INSERT
CREATE POLICY "Users can insert parameters for their matrix"
ON public.system_parameters
FOR INSERT
WITH CHECK (
  matrix_id = get_user_matrix_id()
  AND (is_matriz_profile_user() OR is_master_user())
);

-- Política de UPDATE
CREATE POLICY "Users can update parameters for their matrix"
ON public.system_parameters
FOR UPDATE
USING (
  matrix_id = get_user_matrix_id()
  AND (is_matriz_profile_user() OR is_master_user())
);

-- Política de DELETE
CREATE POLICY "Users can delete parameters for their matrix"
ON public.system_parameters
FOR DELETE
USING (
  matrix_id = get_user_matrix_id()
  AND (is_matriz_profile_user() OR is_master_user())
);
