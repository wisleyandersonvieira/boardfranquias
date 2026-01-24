-- Drop existing policies for cash_control_card_items
DROP POLICY IF EXISTS "Users can view card items for their store cash control" ON cash_control_card_items;
DROP POLICY IF EXISTS "Users can manage card items for their store cash control" ON cash_control_card_items;

-- Drop existing policies for cash_control_account_items
DROP POLICY IF EXISTS "Users can view account items for their store cash control" ON cash_control_account_items;
DROP POLICY IF EXISTS "Users can manage account items for their store cash control" ON cash_control_account_items;

-- Drop existing policies for cash_control_delivery_items
DROP POLICY IF EXISTS "Users can view delivery items for their store cash control" ON cash_control_delivery_items;
DROP POLICY IF EXISTS "Users can manage delivery items for their store cash control" ON cash_control_delivery_items;

-- Drop existing policies for cash_control_cash_items
DROP POLICY IF EXISTS "Users can view cash items for their store cash control" ON cash_control_cash_items;
DROP POLICY IF EXISTS "Users can manage cash items for their store cash control" ON cash_control_cash_items;

-- Create new SELECT policies that check ALL user stores
CREATE POLICY "Users can view card items for their stores"
ON cash_control_card_items FOR SELECT
USING (
  user_has_permission('caixa', 'read') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM cash_control cc
      JOIN user_stores us ON cc.store_id = us.store_id
      WHERE cc.id = cash_control_card_items.cash_control_id AND us.user_id = auth.uid()
    )
  )
);

-- Create new ALL policies that check ALL user stores
CREATE POLICY "Users can manage card items for their stores"
ON cash_control_card_items FOR ALL
USING (
  user_has_permission('caixa', 'write') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM cash_control cc
      JOIN user_stores us ON cc.store_id = us.store_id
      WHERE cc.id = cash_control_card_items.cash_control_id AND us.user_id = auth.uid()
    )
  )
);

-- Create new SELECT policies for account items
CREATE POLICY "Users can view account items for their stores"
ON cash_control_account_items FOR SELECT
USING (
  user_has_permission('caixa', 'read') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM cash_control cc
      JOIN user_stores us ON cc.store_id = us.store_id
      WHERE cc.id = cash_control_account_items.cash_control_id AND us.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can manage account items for their stores"
ON cash_control_account_items FOR ALL
USING (
  user_has_permission('caixa', 'write') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM cash_control cc
      JOIN user_stores us ON cc.store_id = us.store_id
      WHERE cc.id = cash_control_account_items.cash_control_id AND us.user_id = auth.uid()
    )
  )
);

-- Create new SELECT policies for delivery items
CREATE POLICY "Users can view delivery items for their stores"
ON cash_control_delivery_items FOR SELECT
USING (
  user_has_permission('caixa', 'read') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM cash_control cc
      JOIN user_stores us ON cc.store_id = us.store_id
      WHERE cc.id = cash_control_delivery_items.cash_control_id AND us.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can manage delivery items for their stores"
ON cash_control_delivery_items FOR ALL
USING (
  user_has_permission('caixa', 'write') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM cash_control cc
      JOIN user_stores us ON cc.store_id = us.store_id
      WHERE cc.id = cash_control_delivery_items.cash_control_id AND us.user_id = auth.uid()
    )
  )
);

-- Create new SELECT policies for cash items
CREATE POLICY "Users can view cash items for their stores"
ON cash_control_cash_items FOR SELECT
USING (
  user_has_permission('caixa', 'read') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM cash_control cc
      JOIN user_stores us ON cc.store_id = us.store_id
      WHERE cc.id = cash_control_cash_items.cash_control_id AND us.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can manage cash items for their stores"
ON cash_control_cash_items FOR ALL
USING (
  user_has_permission('caixa', 'write') AND (
    get_user_role() = 'admin' OR
    EXISTS (
      SELECT 1 FROM cash_control cc
      JOIN user_stores us ON cc.store_id = us.store_id
      WHERE cc.id = cash_control_cash_items.cash_control_id AND us.user_id = auth.uid()
    )
  )
);