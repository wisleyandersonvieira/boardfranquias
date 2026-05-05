DROP POLICY IF EXISTS "Users can view nfe imports for their store" ON public.nfe_importacoes;
DROP POLICY IF EXISTS "Users can manage nfe imports for their store" ON public.nfe_importacoes;

CREATE POLICY "Users can view nfe imports for their store"
ON public.nfe_importacoes
FOR SELECT
USING (
  user_has_permission('contas_pagar'::text, 'read'::permission_type)
  AND (get_user_role() = 'admin'::user_role OR user_has_access_to_store(store_id))
);

CREATE POLICY "Users can manage nfe imports for their store"
ON public.nfe_importacoes
FOR ALL
USING (
  user_has_permission('contas_pagar'::text, 'write'::permission_type)
  AND (get_user_role() = 'admin'::user_role OR user_has_access_to_store(store_id))
)
WITH CHECK (
  user_has_permission('contas_pagar'::text, 'write'::permission_type)
  AND (get_user_role() = 'admin'::user_role OR user_has_access_to_store(store_id))
);