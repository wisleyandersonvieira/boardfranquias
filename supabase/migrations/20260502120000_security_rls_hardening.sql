-- Harden policies that previously allowed every authenticated user to read or
-- mutate tenant-scoped records.

DROP POLICY IF EXISTS "Users can view store goals" ON public.store_goals;
DROP POLICY IF EXISTS "Users can insert store goals" ON public.store_goals;
DROP POLICY IF EXISTS "Users can update store goals" ON public.store_goals;
DROP POLICY IF EXISTS "Users can delete store goals" ON public.store_goals;

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

CREATE POLICY "Users can view account store associations for accessible stores"
ON public.current_account_stores
FOR SELECT
TO authenticated
USING (public.user_has_access_to_store(store_id));
