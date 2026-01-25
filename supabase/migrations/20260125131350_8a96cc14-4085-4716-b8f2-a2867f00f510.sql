-- Adicionar coluna matrix_id na tabela creditors
ALTER TABLE public.creditors
ADD COLUMN matrix_id uuid REFERENCES public.matrices(id);

-- Migrar dados existentes para a matriz 1 (Premier - código 1)
UPDATE public.creditors 
SET matrix_id = (SELECT id FROM public.matrices WHERE code = 1 LIMIT 1)
WHERE matrix_id IS NULL;

-- Tornar a coluna obrigatória
ALTER TABLE public.creditors
ALTER COLUMN matrix_id SET NOT NULL;

-- Criar índice para melhor performance
CREATE INDEX idx_creditors_matrix_id ON public.creditors(matrix_id);

-- Remover políticas antigas
DROP POLICY IF EXISTS "Users can view creditors for their store" ON public.creditors;
DROP POLICY IF EXISTS "Users can create creditors for their store" ON public.creditors;
DROP POLICY IF EXISTS "Users can update creditors for their store" ON public.creditors;
DROP POLICY IF EXISTS "Users can delete creditors for their store" ON public.creditors;

-- Criar novas políticas baseadas em matriz
CREATE POLICY "Users can view creditors for their matrix"
ON public.creditors
FOR SELECT
USING (matrix_id = get_user_matrix_id());

CREATE POLICY "Users can insert creditors for their matrix"
ON public.creditors
FOR INSERT
WITH CHECK (matrix_id = get_user_matrix_id() AND user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can update creditors for their matrix"
ON public.creditors
FOR UPDATE
USING (matrix_id = get_user_matrix_id() AND user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can delete creditors for their matrix"
ON public.creditors
FOR DELETE
USING (matrix_id = get_user_matrix_id() AND user_has_permission('cadastros', 'write'));