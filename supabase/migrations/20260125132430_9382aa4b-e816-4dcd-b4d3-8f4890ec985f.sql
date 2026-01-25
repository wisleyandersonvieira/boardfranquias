-- Adicionar coluna matrix_id na tabela partners
ALTER TABLE public.partners
ADD COLUMN matrix_id uuid REFERENCES public.matrices(id);

-- Migrar dados existentes para a matriz 1 (Premier - código 1)
UPDATE public.partners 
SET matrix_id = (SELECT id FROM public.matrices WHERE code = 1 LIMIT 1)
WHERE matrix_id IS NULL;

-- Tornar a coluna obrigatória
ALTER TABLE public.partners
ALTER COLUMN matrix_id SET NOT NULL;

-- Criar índice para melhor performance
CREATE INDEX idx_partners_matrix_id ON public.partners(matrix_id);

-- Remover políticas antigas
DROP POLICY IF EXISTS "Users can view partners" ON public.partners;
DROP POLICY IF EXISTS "Users can create partners" ON public.partners;
DROP POLICY IF EXISTS "Users can update partners" ON public.partners;
DROP POLICY IF EXISTS "Users can delete partners" ON public.partners;
DROP POLICY IF EXISTS "Authenticated users can view partners" ON public.partners;
DROP POLICY IF EXISTS "Users with write permission can insert partners" ON public.partners;
DROP POLICY IF EXISTS "Users with write permission can update partners" ON public.partners;
DROP POLICY IF EXISTS "Users with write permission can delete partners" ON public.partners;

-- Criar novas políticas baseadas em matriz
CREATE POLICY "Users can view partners for their matrix"
ON public.partners
FOR SELECT
USING (matrix_id = get_user_matrix_id());

CREATE POLICY "Users can insert partners for their matrix"
ON public.partners
FOR INSERT
WITH CHECK (matrix_id = get_user_matrix_id() AND user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can update partners for their matrix"
ON public.partners
FOR UPDATE
USING (matrix_id = get_user_matrix_id() AND user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can delete partners for their matrix"
ON public.partners
FOR DELETE
USING (matrix_id = get_user_matrix_id() AND user_has_permission('cadastros', 'write'));