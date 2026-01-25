-- Criar nova função que calcula o próximo código por matriz
CREATE OR REPLACE FUNCTION get_next_product_code_by_matrix(p_matrix_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(CAST(code AS INTEGER)), 0) + 1 
  FROM public.products 
  WHERE code ~ '^[0-9]+$'
    AND matrix_id = p_matrix_id;
$$;

-- Atualizar função original para usar a matriz do usuário logado
CREATE OR REPLACE FUNCTION get_next_product_code()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX(CAST(code AS INTEGER)), 0) + 1 
  FROM public.products 
  WHERE code ~ '^[0-9]+$'
    AND matrix_id = get_user_matrix_id();
$$;