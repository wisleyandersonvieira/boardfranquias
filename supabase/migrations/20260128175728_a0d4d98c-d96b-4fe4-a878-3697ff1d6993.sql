-- 1. Adicionar coluna matrix_id na tabela period_blocks
ALTER TABLE public.period_blocks 
ADD COLUMN matrix_id uuid REFERENCES public.matrices(id);

-- 2. Atualizar registros existentes para a matriz Premier (939e9256-75ff-44ad-b1d5-00ed39b30362)
UPDATE public.period_blocks 
SET matrix_id = '939e9256-75ff-44ad-b1d5-00ed39b30362' 
WHERE matrix_id IS NULL;

-- 3. Tornar a coluna NOT NULL após a migração dos dados
ALTER TABLE public.period_blocks 
ALTER COLUMN matrix_id SET NOT NULL;

-- 4. Remover políticas RLS antigas
DROP POLICY IF EXISTS "Users can create period blocks" ON public.period_blocks;
DROP POLICY IF EXISTS "Users can delete period blocks" ON public.period_blocks;
DROP POLICY IF EXISTS "Users can update period blocks" ON public.period_blocks;
DROP POLICY IF EXISTS "Users can view period blocks" ON public.period_blocks;
DROP POLICY IF EXISTS "Users can manage period blocks" ON public.period_blocks;

-- 5. Criar novas políticas RLS com isolamento por matriz
CREATE POLICY "Users can view period blocks for their matrix"
ON public.period_blocks
FOR SELECT
USING (matrix_id = get_user_matrix_id());

CREATE POLICY "Users can insert period blocks for their matrix"
ON public.period_blocks
FOR INSERT
WITH CHECK (
  matrix_id = get_user_matrix_id() AND 
  user_has_permission('financeiro', 'write')
);

CREATE POLICY "Users can update period blocks for their matrix"
ON public.period_blocks
FOR UPDATE
USING (
  matrix_id = get_user_matrix_id() AND 
  user_has_permission('financeiro', 'write')
);

CREATE POLICY "Users can delete period blocks for their matrix"
ON public.period_blocks
FOR DELETE
USING (
  matrix_id = get_user_matrix_id() AND 
  user_has_permission('financeiro', 'write')
);