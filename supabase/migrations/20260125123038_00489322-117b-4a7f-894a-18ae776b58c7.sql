-- Add matrix_id to current_accounts
ALTER TABLE public.current_accounts 
ADD COLUMN IF NOT EXISTS matrix_id uuid REFERENCES public.matrices(id);

-- Set default matrix for existing records (matrix with code = 1)
UPDATE public.current_accounts 
SET matrix_id = (SELECT id FROM public.matrices WHERE code = 1 LIMIT 1)
WHERE matrix_id IS NULL;

-- Make matrix_id NOT NULL after setting defaults
ALTER TABLE public.current_accounts 
ALTER COLUMN matrix_id SET NOT NULL;

-- Add matrix_id to delivery_accounts
ALTER TABLE public.delivery_accounts 
ADD COLUMN IF NOT EXISTS matrix_id uuid REFERENCES public.matrices(id);

UPDATE public.delivery_accounts 
SET matrix_id = (SELECT id FROM public.matrices WHERE code = 1 LIMIT 1)
WHERE matrix_id IS NULL;

ALTER TABLE public.delivery_accounts 
ALTER COLUMN matrix_id SET NOT NULL;

-- Add matrix_id to card_accounts
ALTER TABLE public.card_accounts 
ADD COLUMN IF NOT EXISTS matrix_id uuid REFERENCES public.matrices(id);

UPDATE public.card_accounts 
SET matrix_id = (SELECT id FROM public.matrices WHERE code = 1 LIMIT 1)
WHERE matrix_id IS NULL;

ALTER TABLE public.card_accounts 
ALTER COLUMN matrix_id SET NOT NULL;

-- Add matrix_id to cash_accounts
ALTER TABLE public.cash_accounts 
ADD COLUMN IF NOT EXISTS matrix_id uuid REFERENCES public.matrices(id);

UPDATE public.cash_accounts 
SET matrix_id = (SELECT id FROM public.matrices WHERE code = 1 LIMIT 1)
WHERE matrix_id IS NULL;

ALTER TABLE public.cash_accounts 
ALTER COLUMN matrix_id SET NOT NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_current_accounts_matrix_id ON public.current_accounts(matrix_id);
CREATE INDEX IF NOT EXISTS idx_delivery_accounts_matrix_id ON public.delivery_accounts(matrix_id);
CREATE INDEX IF NOT EXISTS idx_card_accounts_matrix_id ON public.card_accounts(matrix_id);
CREATE INDEX IF NOT EXISTS idx_cash_accounts_matrix_id ON public.cash_accounts(matrix_id);

-- Update RLS policies for current_accounts
DROP POLICY IF EXISTS "Authenticated users can select current accounts" ON public.current_accounts;
DROP POLICY IF EXISTS "Authenticated users can insert current accounts" ON public.current_accounts;
DROP POLICY IF EXISTS "Authenticated users can update current accounts" ON public.current_accounts;
DROP POLICY IF EXISTS "Authenticated users can delete current accounts" ON public.current_accounts;

CREATE POLICY "Users can view current accounts for their matrix"
ON public.current_accounts FOR SELECT
USING (matrix_id = get_user_matrix_id());

CREATE POLICY "Users can insert current accounts for their matrix"
ON public.current_accounts FOR INSERT
WITH CHECK (matrix_id = get_user_matrix_id() AND user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can update current accounts for their matrix"
ON public.current_accounts FOR UPDATE
USING (matrix_id = get_user_matrix_id() AND user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can delete current accounts for their matrix"
ON public.current_accounts FOR DELETE
USING (matrix_id = get_user_matrix_id() AND user_has_permission('cadastros', 'write'));

-- Delivery accounts RLS
DROP POLICY IF EXISTS "Authenticated users can select delivery accounts" ON public.delivery_accounts;
DROP POLICY IF EXISTS "Authenticated users can insert delivery accounts" ON public.delivery_accounts;
DROP POLICY IF EXISTS "Authenticated users can update delivery accounts" ON public.delivery_accounts;
DROP POLICY IF EXISTS "Authenticated users can delete delivery accounts" ON public.delivery_accounts;

CREATE POLICY "Users can view delivery accounts for their matrix"
ON public.delivery_accounts FOR SELECT
USING (matrix_id = get_user_matrix_id());

CREATE POLICY "Users can insert delivery accounts for their matrix"
ON public.delivery_accounts FOR INSERT
WITH CHECK (matrix_id = get_user_matrix_id() AND user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can update delivery accounts for their matrix"
ON public.delivery_accounts FOR UPDATE
USING (matrix_id = get_user_matrix_id() AND user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can delete delivery accounts for their matrix"
ON public.delivery_accounts FOR DELETE
USING (matrix_id = get_user_matrix_id() AND user_has_permission('cadastros', 'write'));

-- Card accounts RLS
DROP POLICY IF EXISTS "Authenticated users can select card accounts" ON public.card_accounts;
DROP POLICY IF EXISTS "Authenticated users can insert card accounts" ON public.card_accounts;
DROP POLICY IF EXISTS "Authenticated users can update card accounts" ON public.card_accounts;
DROP POLICY IF EXISTS "Authenticated users can delete card accounts" ON public.card_accounts;

CREATE POLICY "Users can view card accounts for their matrix"
ON public.card_accounts FOR SELECT
USING (matrix_id = get_user_matrix_id());

CREATE POLICY "Users can insert card accounts for their matrix"
ON public.card_accounts FOR INSERT
WITH CHECK (matrix_id = get_user_matrix_id() AND user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can update card accounts for their matrix"
ON public.card_accounts FOR UPDATE
USING (matrix_id = get_user_matrix_id() AND user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can delete card accounts for their matrix"
ON public.card_accounts FOR DELETE
USING (matrix_id = get_user_matrix_id() AND user_has_permission('cadastros', 'write'));

-- Cash accounts RLS
DROP POLICY IF EXISTS "Authenticated users can select cash accounts" ON public.cash_accounts;
DROP POLICY IF EXISTS "Authenticated users can insert cash accounts" ON public.cash_accounts;
DROP POLICY IF EXISTS "Authenticated users can update cash accounts" ON public.cash_accounts;
DROP POLICY IF EXISTS "Authenticated users can delete cash accounts" ON public.cash_accounts;

CREATE POLICY "Users can view cash accounts for their matrix"
ON public.cash_accounts FOR SELECT
USING (matrix_id = get_user_matrix_id());

CREATE POLICY "Users can insert cash accounts for their matrix"
ON public.cash_accounts FOR INSERT
WITH CHECK (matrix_id = get_user_matrix_id() AND user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can update cash accounts for their matrix"
ON public.cash_accounts FOR UPDATE
USING (matrix_id = get_user_matrix_id() AND user_has_permission('cadastros', 'write'));

CREATE POLICY "Users can delete cash accounts for their matrix"
ON public.cash_accounts FOR DELETE
USING (matrix_id = get_user_matrix_id() AND user_has_permission('cadastros', 'write'));