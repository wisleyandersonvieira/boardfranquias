-- Atualizar políticas de stock_control para usar user_has_access_to_store ao invés de get_user_store_id
-- Isso permite que usuários com múltiplas lojas acessem estoque de todas elas

-- Remover políticas antigas
DROP POLICY IF EXISTS "Users can manage stock control for their store" ON public.stock_control;
DROP POLICY IF EXISTS "Users can view stock control for their store" ON public.stock_control;
DROP POLICY IF EXISTS "Users can manage stock items for their store" ON public.stock_control_items;
DROP POLICY IF EXISTS "Users can view stock items for their store" ON public.stock_control_items;

-- Criar novas políticas para stock_control usando user_has_access_to_store
CREATE POLICY "Users can view stock control for their stores"
ON public.stock_control
FOR SELECT
USING (
  user_has_permission('estoque'::text, 'read'::permission_type) 
  AND (
    get_user_role() = 'admin'::user_role 
    OR user_has_access_to_store(store_id)
  )
);

CREATE POLICY "Users can insert stock control for their stores"
ON public.stock_control
FOR INSERT
WITH CHECK (
  user_has_permission('estoque'::text, 'write'::permission_type) 
  AND (
    get_user_role() = 'admin'::user_role 
    OR user_has_access_to_store(store_id)
  )
);

CREATE POLICY "Users can update stock control for their stores"
ON public.stock_control
FOR UPDATE
USING (
  user_has_permission('estoque'::text, 'write'::permission_type) 
  AND (
    get_user_role() = 'admin'::user_role 
    OR user_has_access_to_store(store_id)
  )
);

CREATE POLICY "Users can delete stock control for their stores"
ON public.stock_control
FOR DELETE
USING (
  user_has_permission('estoque'::text, 'write'::permission_type) 
  AND (
    get_user_role() = 'admin'::user_role 
    OR user_has_access_to_store(store_id)
  )
);

-- Criar novas políticas para stock_control_items
CREATE POLICY "Users can view stock items for their stores"
ON public.stock_control_items
FOR SELECT
USING (
  user_has_permission('estoque'::text, 'read'::permission_type) 
  AND EXISTS (
    SELECT 1 FROM stock_control sc
    WHERE sc.id = stock_control_items.stock_control_id
    AND (get_user_role() = 'admin'::user_role OR user_has_access_to_store(sc.store_id))
  )
);

CREATE POLICY "Users can insert stock items for their stores"
ON public.stock_control_items
FOR INSERT
WITH CHECK (
  user_has_permission('estoque'::text, 'write'::permission_type) 
  AND EXISTS (
    SELECT 1 FROM stock_control sc
    WHERE sc.id = stock_control_items.stock_control_id
    AND (get_user_role() = 'admin'::user_role OR user_has_access_to_store(sc.store_id))
  )
);

CREATE POLICY "Users can update stock items for their stores"
ON public.stock_control_items
FOR UPDATE
USING (
  user_has_permission('estoque'::text, 'write'::permission_type) 
  AND EXISTS (
    SELECT 1 FROM stock_control sc
    WHERE sc.id = stock_control_items.stock_control_id
    AND (get_user_role() = 'admin'::user_role OR user_has_access_to_store(sc.store_id))
  )
);

CREATE POLICY "Users can delete stock items for their stores"
ON public.stock_control_items
FOR DELETE
USING (
  user_has_permission('estoque'::text, 'write'::permission_type) 
  AND EXISTS (
    SELECT 1 FROM stock_control sc
    WHERE sc.id = stock_control_items.stock_control_id
    AND (get_user_role() = 'admin'::user_role OR user_has_access_to_store(sc.store_id))
  )
);