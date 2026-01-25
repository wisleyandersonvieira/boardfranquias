-- Adicionar coluna matrix_id na tabela products
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS matrix_id uuid REFERENCES public.matrices(id);

-- Atualizar produtos existentes para usar matriz com código 1
UPDATE public.products 
SET matrix_id = (SELECT id FROM public.matrices WHERE code = 1 LIMIT 1)
WHERE matrix_id IS NULL;

-- Tornar a coluna obrigatória após atualizar os registros existentes
ALTER TABLE public.products 
ALTER COLUMN matrix_id SET NOT NULL;

-- Criar índice para performance nas consultas por matriz
CREATE INDEX IF NOT EXISTS idx_products_matrix_id ON public.products(matrix_id);

-- Remover políticas RLS antigas se existirem
DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can insert products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can update products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can delete products" ON public.products;
DROP POLICY IF EXISTS "Users can view products" ON public.products;
DROP POLICY IF EXISTS "Users can insert products" ON public.products;
DROP POLICY IF EXISTS "Users can update products" ON public.products;
DROP POLICY IF EXISTS "Users can delete products" ON public.products;
DROP POLICY IF EXISTS "Users can view products for their matrix" ON public.products;
DROP POLICY IF EXISTS "Users can insert products for their matrix" ON public.products;
DROP POLICY IF EXISTS "Users can update products for their matrix" ON public.products;
DROP POLICY IF EXISTS "Users can delete products for their matrix" ON public.products;

-- Garantir que RLS está habilitado
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Criar políticas RLS baseadas na matriz do usuário
CREATE POLICY "Users can view products for their matrix"
ON public.products
FOR SELECT
USING (matrix_id = get_user_matrix_id());

CREATE POLICY "Users can insert products for their matrix"
ON public.products
FOR INSERT
WITH CHECK (
  matrix_id = get_user_matrix_id() 
  AND user_has_permission('produtos'::text, 'write'::permission_type)
);

CREATE POLICY "Users can update products for their matrix"
ON public.products
FOR UPDATE
USING (
  matrix_id = get_user_matrix_id() 
  AND user_has_permission('produtos'::text, 'write'::permission_type)
);

CREATE POLICY "Users can delete products for their matrix"
ON public.products
FOR DELETE
USING (
  matrix_id = get_user_matrix_id() 
  AND user_has_permission('produtos'::text, 'admin'::permission_type)
);