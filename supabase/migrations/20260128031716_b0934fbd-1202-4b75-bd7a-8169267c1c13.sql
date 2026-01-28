
-- Remover políticas antigas que estão causando conflito
DROP POLICY IF EXISTS "Authenticated users can view system parameters" ON public.system_parameters;
DROP POLICY IF EXISTS "Authenticated users can insert system parameters" ON public.system_parameters;
DROP POLICY IF EXISTS "Authenticated users can update system parameters" ON public.system_parameters;

-- Recriar as políticas com a lógica correta (PERMISSIVE em vez de RESTRICTIVE para funcionar corretamente)
DROP POLICY IF EXISTS "Users can view parameters for their matrix" ON public.system_parameters;
DROP POLICY IF EXISTS "Users can insert parameters for their matrix" ON public.system_parameters;
DROP POLICY IF EXISTS "Users can update parameters for their matrix" ON public.system_parameters;
DROP POLICY IF EXISTS "Users can delete parameters for their matrix" ON public.system_parameters;

-- Política de SELECT para usuários com perfil Matriz ou master
CREATE POLICY "Users can view parameters for their matrix"
ON public.system_parameters
FOR SELECT
USING (
  matrix_id = get_user_matrix_id()
  AND (
    is_matriz_profile_user() 
    OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'wisley_anderson@hotmail.com'
  )
);

-- Política de INSERT para usuários com perfil Matriz ou master
CREATE POLICY "Users can insert parameters for their matrix"
ON public.system_parameters
FOR INSERT
WITH CHECK (
  matrix_id = get_user_matrix_id()
  AND (
    is_matriz_profile_user() 
    OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'wisley_anderson@hotmail.com'
  )
);

-- Política de UPDATE para usuários com perfil Matriz ou master
CREATE POLICY "Users can update parameters for their matrix"
ON public.system_parameters
FOR UPDATE
USING (
  matrix_id = get_user_matrix_id()
  AND (
    is_matriz_profile_user() 
    OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'wisley_anderson@hotmail.com'
  )
);

-- Política de DELETE para usuários com perfil Matriz ou master
CREATE POLICY "Users can delete parameters for their matrix"
ON public.system_parameters
FOR DELETE
USING (
  matrix_id = get_user_matrix_id()
  AND (
    is_matriz_profile_user() 
    OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'wisley_anderson@hotmail.com'
  )
);
