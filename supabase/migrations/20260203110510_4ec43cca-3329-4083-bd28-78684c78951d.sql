
-- Remove a política atual que exige write para todas as operações
DROP POLICY IF EXISTS "Users can manage service orders for their stores" ON service_orders;
DROP POLICY IF EXISTS "Users can view service orders for their stores" ON service_orders;

-- Política para visualização (read)
CREATE POLICY "Users can view service orders for their stores"
ON service_orders
FOR SELECT
USING (
  user_has_permission('financeiro', 'read') 
  AND user_has_access_to_store(store_id)
);

-- Política para cadastro (INSERT) - permite com permissão read
CREATE POLICY "Users can insert service orders for their stores"
ON service_orders
FOR INSERT
WITH CHECK (
  user_has_permission('financeiro', 'read') 
  AND user_has_access_to_store(store_id)
);

-- Política para edição (UPDATE) - exige permissão write
CREATE POLICY "Users can update service orders for their stores"
ON service_orders
FOR UPDATE
USING (
  user_has_permission('financeiro', 'write') 
  AND user_has_access_to_store(store_id)
);

-- Política para exclusão (DELETE) - exige permissão write
CREATE POLICY "Users can delete service orders for their stores"
ON service_orders
FOR DELETE
USING (
  user_has_permission('financeiro', 'write') 
  AND user_has_access_to_store(store_id)
);
