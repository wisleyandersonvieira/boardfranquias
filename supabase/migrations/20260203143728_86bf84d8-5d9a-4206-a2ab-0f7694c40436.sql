-- Atualizar política de visualização dos parâmetros do sistema
-- Permitir que todos os usuários autenticados da matriz possam visualizar os parâmetros

DROP POLICY IF EXISTS "Users can view parameters for their matrix" ON public.system_parameters;

CREATE POLICY "Users can view parameters for their matrix" 
ON public.system_parameters 
FOR SELECT 
USING (matrix_id = get_user_matrix_id());