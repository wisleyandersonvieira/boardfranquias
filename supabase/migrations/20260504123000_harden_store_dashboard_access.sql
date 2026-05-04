-- Restrict store visibility to the logged user's linked stores.
-- Dashboard data must never expand "Todas as lojas" beyond explicit user links.

CREATE OR REPLACE FUNCTION public.user_has_access_to_store(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_stores
    WHERE user_id = auth.uid()
      AND store_id = p_store_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND store_id = p_store_id
  );
$$;

DROP POLICY IF EXISTS "Users can view all stores" ON public.stores;
DROP POLICY IF EXISTS "Users can view stores for their matrix" ON public.stores;
DROP POLICY IF EXISTS "Users can view linked stores" ON public.stores;

CREATE POLICY "Users can view linked stores"
ON public.stores
FOR SELECT
USING (
  public.get_user_role() = 'admin'::user_role
  OR public.user_has_access_to_store(id)
);
