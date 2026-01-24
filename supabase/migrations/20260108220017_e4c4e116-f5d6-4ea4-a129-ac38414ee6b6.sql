-- Criar função para buscar membros de lojas específicas
-- Usando SECURITY DEFINER para bypassar RLS de user_stores
CREATE OR REPLACE FUNCTION public.get_store_members(store_ids uuid[])
RETURNS TABLE (
  user_id uuid,
  user_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.id as user_id, p.name as user_name
  FROM user_stores us
  JOIN profiles p ON p.id = us.user_id
  WHERE us.store_id = ANY(store_ids)
  AND p.is_active = true
  ORDER BY p.name;
$$;