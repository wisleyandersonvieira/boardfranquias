-- Harden policies that previously allowed every authenticated user to read or
-- mutate tenant-scoped records.

DROP POLICY IF EXISTS "Users can view store goals" ON public.store_goals;
DROP POLICY IF EXISTS "Users can insert store goals" ON public.store_goals;
DROP POLICY IF EXISTS "Users can update store goals" ON public.store_goals;
DROP POLICY IF EXISTS "Users can delete store goals" ON public.store_goals;
DROP POLICY IF EXISTS "Users can view store goals for accessible stores" ON public.store_goals;
DROP POLICY IF EXISTS "Users can insert store goals for accessible stores" ON public.store_goals;
DROP POLICY IF EXISTS "Users can update store goals for accessible stores" ON public.store_goals;
DROP POLICY IF EXISTS "Users can delete store goals for accessible stores" ON public.store_goals;

CREATE POLICY "Users can view store goals for accessible stores"
ON public.store_goals
FOR SELECT
TO authenticated
USING (public.user_has_access_to_store(store_id));

CREATE POLICY "Users can insert store goals for accessible stores"
ON public.store_goals
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_has_access_to_store(store_id)
  AND public.user_has_permission('financeiro', 'write')
);

CREATE POLICY "Users can update store goals for accessible stores"
ON public.store_goals
FOR UPDATE
TO authenticated
USING (
  public.user_has_access_to_store(store_id)
  AND public.user_has_permission('financeiro', 'write')
)
WITH CHECK (
  public.user_has_access_to_store(store_id)
  AND public.user_has_permission('financeiro', 'write')
);

CREATE POLICY "Users can delete store goals for accessible stores"
ON public.store_goals
FOR DELETE
TO authenticated
USING (
  public.user_has_access_to_store(store_id)
  AND public.user_has_permission('financeiro', 'write')
);

DROP POLICY IF EXISTS "Authenticated users can view checklist items" ON public.task_checklist_items;
DROP POLICY IF EXISTS "Authenticated users can create checklist items" ON public.task_checklist_items;
DROP POLICY IF EXISTS "Authenticated users can update checklist items" ON public.task_checklist_items;
DROP POLICY IF EXISTS "Authenticated users can delete checklist items" ON public.task_checklist_items;
DROP POLICY IF EXISTS "Users can view checklist items with access" ON public.task_checklist_items;
DROP POLICY IF EXISTS "Users with access can create checklist items" ON public.task_checklist_items;
DROP POLICY IF EXISTS "Users with access can update checklist items" ON public.task_checklist_items;
DROP POLICY IF EXISTS "Users with access can delete checklist items" ON public.task_checklist_items;

CREATE POLICY "Users can view checklist items with access"
ON public.task_checklist_items
FOR SELECT
TO authenticated
USING (public.user_can_access_task(task_id));

CREATE POLICY "Users with access can create checklist items"
ON public.task_checklist_items
FOR INSERT
TO authenticated
WITH CHECK (public.user_can_access_task(task_id));

CREATE POLICY "Users with access can update checklist items"
ON public.task_checklist_items
FOR UPDATE
TO authenticated
USING (public.user_can_access_task(task_id))
WITH CHECK (public.user_can_access_task(task_id));

CREATE POLICY "Users with access can delete checklist items"
ON public.task_checklist_items
FOR DELETE
TO authenticated
USING (public.user_can_access_task(task_id));

DROP POLICY IF EXISTS "Authenticated users can view comments" ON public.task_comments;
DROP POLICY IF EXISTS "Authenticated users can create comments" ON public.task_comments;
DROP POLICY IF EXISTS "Comment authors can update" ON public.task_comments;
DROP POLICY IF EXISTS "Comment authors can delete" ON public.task_comments;
DROP POLICY IF EXISTS "Users can view comments with access" ON public.task_comments;
DROP POLICY IF EXISTS "Users with access can create comments" ON public.task_comments;
DROP POLICY IF EXISTS "Comment authors or admins can delete" ON public.task_comments;

CREATE POLICY "Users can view comments with access"
ON public.task_comments
FOR SELECT
TO authenticated
USING (public.user_can_access_task(task_id));

CREATE POLICY "Users with access can create comments"
ON public.task_comments
FOR INSERT
TO authenticated
WITH CHECK (public.user_can_access_task(task_id) AND auth.uid() = user_id);

CREATE POLICY "Comment authors can update"
ON public.task_comments
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Comment authors or admins can delete"
ON public.task_comments
FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR public.get_user_role() = 'admin');

DROP POLICY IF EXISTS "Users can view account store associations" ON public.current_account_stores;
DROP POLICY IF EXISTS "Users can view account store associations for accessible stores" ON public.current_account_stores;

CREATE POLICY "Users can view account store associations for accessible stores"
ON public.current_account_stores
FOR SELECT
TO authenticated
USING (public.user_has_access_to_store(store_id));

DROP POLICY IF EXISTS "Users can create current accounts with permissions" ON public.current_accounts;
DROP POLICY IF EXISTS "Authenticated users can insert current accounts" ON public.current_accounts;
DROP POLICY IF EXISTS "Authenticated users can select current accounts" ON public.current_accounts;
DROP POLICY IF EXISTS "Authenticated users can update current accounts" ON public.current_accounts;
DROP POLICY IF EXISTS "Authenticated users can delete current accounts" ON public.current_accounts;
DROP POLICY IF EXISTS "Users can insert current accounts with permission" ON public.current_accounts;
DROP POLICY IF EXISTS "Users can select current accounts for accessible stores" ON public.current_accounts;
DROP POLICY IF EXISTS "Users can update current accounts for accessible stores" ON public.current_accounts;
DROP POLICY IF EXISTS "Users can delete current accounts for accessible stores" ON public.current_accounts;

CREATE POLICY "Users can insert current accounts with permission"
ON public.current_accounts
FOR INSERT
TO authenticated
WITH CHECK (public.user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can select current accounts for accessible stores"
ON public.current_accounts
FOR SELECT
TO authenticated
USING (
  public.get_user_role() = 'admin'
  OR EXISTS (
    SELECT 1
    FROM public.current_account_stores cas
    WHERE cas.account_id = current_accounts.id
      AND public.user_has_access_to_store(cas.store_id)
  )
);

CREATE POLICY "Users can update current accounts for accessible stores"
ON public.current_accounts
FOR UPDATE
TO authenticated
USING (
  public.user_has_permission('cadastros', 'write')
  AND (
    public.get_user_role() = 'admin'
    OR EXISTS (
      SELECT 1
      FROM public.current_account_stores cas
      WHERE cas.account_id = current_accounts.id
        AND public.user_has_access_to_store(cas.store_id)
    )
  )
)
WITH CHECK (public.user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can delete current accounts for accessible stores"
ON public.current_accounts
FOR DELETE
TO authenticated
USING (
  public.user_has_permission('cadastros', 'write')
  AND (
    public.get_user_role() = 'admin'
    OR EXISTS (
      SELECT 1
      FROM public.current_account_stores cas
      WHERE cas.account_id = current_accounts.id
        AND public.user_has_access_to_store(cas.store_id)
    )
  )
);

DROP POLICY IF EXISTS "Users can insert own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Authenticated users can create own tasks" ON public.tasks;

CREATE POLICY "Authenticated users can create own tasks"
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Authenticated users can insert cash accounts" ON public.cash_accounts;
DROP POLICY IF EXISTS "Authenticated users can select cash accounts" ON public.cash_accounts;
DROP POLICY IF EXISTS "Authenticated users can update cash accounts" ON public.cash_accounts;
DROP POLICY IF EXISTS "Authenticated users can delete cash accounts" ON public.cash_accounts;
DROP POLICY IF EXISTS "Users can insert cash accounts with permission" ON public.cash_accounts;
DROP POLICY IF EXISTS "Users can select cash accounts for accessible stores" ON public.cash_accounts;
DROP POLICY IF EXISTS "Users can update cash accounts for accessible stores" ON public.cash_accounts;
DROP POLICY IF EXISTS "Users can delete cash accounts for accessible stores" ON public.cash_accounts;

CREATE POLICY "Users can insert cash accounts with permission"
ON public.cash_accounts
FOR INSERT
TO authenticated
WITH CHECK (public.user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can select cash accounts for accessible stores"
ON public.cash_accounts
FOR SELECT
TO authenticated
USING (
  public.get_user_role() = 'admin'
  OR EXISTS (
    SELECT 1 FROM public.cash_account_stores cas
    WHERE cas.account_id = cash_accounts.id
      AND public.user_has_access_to_store(cas.store_id)
  )
);

CREATE POLICY "Users can update cash accounts for accessible stores"
ON public.cash_accounts
FOR UPDATE
TO authenticated
USING (
  public.user_has_permission('cadastros', 'write')
  AND (
    public.get_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.cash_account_stores cas
      WHERE cas.account_id = cash_accounts.id
        AND public.user_has_access_to_store(cas.store_id)
    )
  )
)
WITH CHECK (public.user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can delete cash accounts for accessible stores"
ON public.cash_accounts
FOR DELETE
TO authenticated
USING (
  public.user_has_permission('cadastros', 'write')
  AND (
    public.get_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.cash_account_stores cas
      WHERE cas.account_id = cash_accounts.id
        AND public.user_has_access_to_store(cas.store_id)
    )
  )
);

DROP POLICY IF EXISTS "Authenticated users can insert card accounts" ON public.card_accounts;
DROP POLICY IF EXISTS "Authenticated users can select card accounts" ON public.card_accounts;
DROP POLICY IF EXISTS "Authenticated users can update card accounts" ON public.card_accounts;
DROP POLICY IF EXISTS "Authenticated users can delete card accounts" ON public.card_accounts;
DROP POLICY IF EXISTS "Users can insert card accounts with permission" ON public.card_accounts;
DROP POLICY IF EXISTS "Users can select card accounts for accessible stores" ON public.card_accounts;
DROP POLICY IF EXISTS "Users can update card accounts for accessible stores" ON public.card_accounts;
DROP POLICY IF EXISTS "Users can delete card accounts for accessible stores" ON public.card_accounts;

CREATE POLICY "Users can insert card accounts with permission"
ON public.card_accounts
FOR INSERT
TO authenticated
WITH CHECK (public.user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can select card accounts for accessible stores"
ON public.card_accounts
FOR SELECT
TO authenticated
USING (
  public.get_user_role() = 'admin'
  OR EXISTS (
    SELECT 1 FROM public.card_account_stores cas
    WHERE cas.account_id = card_accounts.id
      AND public.user_has_access_to_store(cas.store_id)
  )
);

CREATE POLICY "Users can update card accounts for accessible stores"
ON public.card_accounts
FOR UPDATE
TO authenticated
USING (
  public.user_has_permission('cadastros', 'write')
  AND (
    public.get_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.card_account_stores cas
      WHERE cas.account_id = card_accounts.id
        AND public.user_has_access_to_store(cas.store_id)
    )
  )
)
WITH CHECK (public.user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can delete card accounts for accessible stores"
ON public.card_accounts
FOR DELETE
TO authenticated
USING (
  public.user_has_permission('cadastros', 'write')
  AND (
    public.get_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.card_account_stores cas
      WHERE cas.account_id = card_accounts.id
        AND public.user_has_access_to_store(cas.store_id)
    )
  )
);

DROP POLICY IF EXISTS "Authenticated users can insert delivery accounts" ON public.delivery_accounts;
DROP POLICY IF EXISTS "Authenticated users can select delivery accounts" ON public.delivery_accounts;
DROP POLICY IF EXISTS "Authenticated users can update delivery accounts" ON public.delivery_accounts;
DROP POLICY IF EXISTS "Authenticated users can delete delivery accounts" ON public.delivery_accounts;
DROP POLICY IF EXISTS "Users can insert delivery accounts with permission" ON public.delivery_accounts;
DROP POLICY IF EXISTS "Users can select delivery accounts for accessible stores" ON public.delivery_accounts;
DROP POLICY IF EXISTS "Users can update delivery accounts for accessible stores" ON public.delivery_accounts;
DROP POLICY IF EXISTS "Users can delete delivery accounts for accessible stores" ON public.delivery_accounts;

CREATE POLICY "Users can insert delivery accounts with permission"
ON public.delivery_accounts
FOR INSERT
TO authenticated
WITH CHECK (public.user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can select delivery accounts for accessible stores"
ON public.delivery_accounts
FOR SELECT
TO authenticated
USING (
  public.get_user_role() = 'admin'
  OR EXISTS (
    SELECT 1 FROM public.delivery_account_stores das
    WHERE das.account_id = delivery_accounts.id
      AND public.user_has_access_to_store(das.store_id)
  )
);

CREATE POLICY "Users can update delivery accounts for accessible stores"
ON public.delivery_accounts
FOR UPDATE
TO authenticated
USING (
  public.user_has_permission('cadastros', 'write')
  AND (
    public.get_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.delivery_account_stores das
      WHERE das.account_id = delivery_accounts.id
        AND public.user_has_access_to_store(das.store_id)
    )
  )
)
WITH CHECK (public.user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can delete delivery accounts for accessible stores"
ON public.delivery_accounts
FOR DELETE
TO authenticated
USING (
  public.user_has_permission('cadastros', 'write')
  AND (
    public.get_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.delivery_account_stores das
      WHERE das.account_id = delivery_accounts.id
        AND public.user_has_access_to_store(das.store_id)
    )
  )
);
