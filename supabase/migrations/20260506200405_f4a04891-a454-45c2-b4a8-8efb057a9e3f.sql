-- Corrigir política RLS de nfe_importacao_itens para suportar usuários com múltiplas lojas
DROP POLICY IF EXISTS "Users can manage nfe import items for their store" ON public.nfe_importacao_itens;
DROP POLICY IF EXISTS "Users can view nfe import items for their store" ON public.nfe_importacao_itens;

CREATE POLICY "Users can view nfe import items for their stores"
ON public.nfe_importacao_itens
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.nfe_importacoes ni
    WHERE ni.id = nfe_importacao_itens.importacao_id
      AND public.user_has_permission('contas_pagar'::text, 'read'::permission_type)
      AND (
        public.get_user_role() = 'admin'::user_role
        OR public.user_has_access_to_store(ni.store_id)
      )
  )
);

CREATE POLICY "Users can manage nfe import items for their stores"
ON public.nfe_importacao_itens
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.nfe_importacoes ni
    WHERE ni.id = nfe_importacao_itens.importacao_id
      AND public.user_has_permission('contas_pagar'::text, 'write'::permission_type)
      AND (
        public.get_user_role() = 'admin'::user_role
        OR public.user_has_access_to_store(ni.store_id)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.nfe_importacoes ni
    WHERE ni.id = nfe_importacao_itens.importacao_id
      AND public.user_has_permission('contas_pagar'::text, 'write'::permission_type)
      AND (
        public.get_user_role() = 'admin'::user_role
        OR public.user_has_access_to_store(ni.store_id)
      )
  )
);