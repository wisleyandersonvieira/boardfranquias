-- Adicionar coluna matrix_id à tabela units_of_measure
ALTER TABLE public.units_of_measure
ADD COLUMN matrix_id uuid REFERENCES public.matrices(id);

-- Atualizar registros existentes para a matriz 1 (Premier)
UPDATE public.units_of_measure
SET matrix_id = '939e9256-75ff-44ad-b1d5-00ed39b30362'
WHERE matrix_id IS NULL;

-- Tornar a coluna NOT NULL após preencher os dados existentes
ALTER TABLE public.units_of_measure
ALTER COLUMN matrix_id SET NOT NULL;

-- Criar índice para performance nas consultas filtradas por matriz
CREATE INDEX idx_units_of_measure_matrix_id ON public.units_of_measure(matrix_id);

-- Remover políticas RLS existentes
DROP POLICY IF EXISTS "Users can view units_of_measure" ON public.units_of_measure;
DROP POLICY IF EXISTS "Users can manage units_of_measure" ON public.units_of_measure;
DROP POLICY IF EXISTS "Authenticated users can view units" ON public.units_of_measure;
DROP POLICY IF EXISTS "Users with write permission can insert units" ON public.units_of_measure;
DROP POLICY IF EXISTS "Users with write permission can update units" ON public.units_of_measure;
DROP POLICY IF EXISTS "Users with write permission can delete units" ON public.units_of_measure;

-- Criar novas políticas RLS baseadas em matriz
CREATE POLICY "Users can view units for their matrix"
ON public.units_of_measure
FOR SELECT
USING (matrix_id = get_user_matrix_id());

CREATE POLICY "Users can insert units for their matrix"
ON public.units_of_measure
FOR INSERT
WITH CHECK (
  matrix_id = get_user_matrix_id() 
  AND user_has_permission('produtos', 'write')
);

CREATE POLICY "Users can update units for their matrix"
ON public.units_of_measure
FOR UPDATE
USING (
  matrix_id = get_user_matrix_id() 
  AND user_has_permission('produtos', 'write')
);

CREATE POLICY "Users can delete units for their matrix"
ON public.units_of_measure
FOR DELETE
USING (
  matrix_id = get_user_matrix_id() 
  AND user_has_permission('produtos', 'write')
);