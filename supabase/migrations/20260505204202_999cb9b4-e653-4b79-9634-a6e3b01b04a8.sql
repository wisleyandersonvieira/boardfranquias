CREATE OR REPLACE FUNCTION public.check_nfe_chave_exists(_chave_acesso text)
RETURNS TABLE(found boolean, store_name text, numero_nfe text, data_emissao date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    true AS found,
    s.name AS store_name,
    n.numero_nfe,
    n.data_emissao
  FROM public.nfe_importacoes n
  LEFT JOIN public.stores s ON s.id = n.store_id
  WHERE n.chave_acesso = _chave_acesso
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.check_nfe_chave_exists(text) TO authenticated;