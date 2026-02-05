-- =============================================
-- BANK RECONCILIATION MODULE TABLES
-- =============================================

-- Table 1: bank_ofx_imports - Stores OFX file import metadata
CREATE TABLE public.bank_ofx_imports (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID NOT NULL,
    account_type TEXT NOT NULL, -- 'current', 'cash', 'card', 'delivery'
    file_name TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    start_date DATE,
    end_date DATE,
    total_transactions INTEGER DEFAULT 0,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    imported_by UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'imported' CHECK (status IN ('imported', 'processing', 'completed', 'error')),
    error_message TEXT,
    matrix_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table 2: bank_ofx_transactions - Stores individual OFX transactions
CREATE TABLE public.bank_ofx_transactions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    import_id UUID NOT NULL REFERENCES public.bank_ofx_imports(id) ON DELETE CASCADE,
    account_id UUID NOT NULL,
    account_type TEXT NOT NULL,
    fitid TEXT NOT NULL,
    trntype TEXT NOT NULL,
    posted_at TIMESTAMPTZ NOT NULL,
    amount NUMERIC(15, 2) NOT NULL,
    name TEXT,
    memo TEXT,
    refnum TEXT,
    raw_payload JSONB,
    is_reconciled BOOLEAN NOT NULL DEFAULT false,
    reconciled_at TIMESTAMPTZ,
    reconciled_by UUID,
    matrix_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(account_id, account_type, fitid)
);

-- Table 3: bank_reconciliations - Stores reconciliation links
CREATE TABLE public.bank_reconciliations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id UUID NOT NULL,
    account_type TEXT NOT NULL,
    ofx_transaction_id UUID NOT NULL REFERENCES public.bank_ofx_transactions(id) ON DELETE CASCADE,
    internal_type TEXT NOT NULL, -- 'accounts_payable', 'accounts_receivable', 'transfer', 'cash_control', 'partner_transaction', 'adjustment', 'other'
    internal_id UUID, -- ID of the internal transaction
    internal_table TEXT, -- Table name for reference
    matched_rule TEXT NOT NULL, -- 'auto_exact', 'auto_fuzzy', 'manual', 'not_identified'
    match_score NUMERIC(5, 2) DEFAULT 0,
    notes TEXT,
    matrix_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

CREATE INDEX idx_bank_ofx_imports_account ON public.bank_ofx_imports(account_id, account_type);
CREATE INDEX idx_bank_ofx_imports_matrix ON public.bank_ofx_imports(matrix_id);
CREATE INDEX idx_bank_ofx_imports_hash ON public.bank_ofx_imports(file_hash);
CREATE INDEX idx_bank_ofx_imports_dates ON public.bank_ofx_imports(start_date, end_date);

CREATE INDEX idx_bank_ofx_transactions_import ON public.bank_ofx_transactions(import_id);
CREATE INDEX idx_bank_ofx_transactions_account ON public.bank_ofx_transactions(account_id, account_type);
CREATE INDEX idx_bank_ofx_transactions_matrix ON public.bank_ofx_transactions(matrix_id);
CREATE INDEX idx_bank_ofx_transactions_reconciled ON public.bank_ofx_transactions(is_reconciled);
CREATE INDEX idx_bank_ofx_transactions_posted ON public.bank_ofx_transactions(posted_at);
CREATE INDEX idx_bank_ofx_transactions_fitid ON public.bank_ofx_transactions(fitid);

CREATE INDEX idx_bank_reconciliations_ofx ON public.bank_reconciliations(ofx_transaction_id);
CREATE INDEX idx_bank_reconciliations_internal ON public.bank_reconciliations(internal_type, internal_id);
CREATE INDEX idx_bank_reconciliations_matrix ON public.bank_reconciliations(matrix_id);
CREATE INDEX idx_bank_reconciliations_account ON public.bank_reconciliations(account_id, account_type);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

ALTER TABLE public.bank_ofx_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_ofx_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_reconciliations ENABLE ROW LEVEL SECURITY;

-- bank_ofx_imports policies
CREATE POLICY "Users can view imports from their matrix"
ON public.bank_ofx_imports FOR SELECT
USING (matrix_id = get_user_matrix_id());

CREATE POLICY "Users with financeiro write can insert imports"
ON public.bank_ofx_imports FOR INSERT
WITH CHECK (
    matrix_id = get_user_matrix_id() 
    AND user_has_permission('financeiro', 'write')
);

CREATE POLICY "Users with financeiro write can update imports"
ON public.bank_ofx_imports FOR UPDATE
USING (
    matrix_id = get_user_matrix_id() 
    AND user_has_permission('financeiro', 'write')
);

CREATE POLICY "Users with financeiro admin can delete imports"
ON public.bank_ofx_imports FOR DELETE
USING (
    matrix_id = get_user_matrix_id() 
    AND user_has_permission('financeiro', 'admin')
);

-- bank_ofx_transactions policies
CREATE POLICY "Users can view transactions from their matrix"
ON public.bank_ofx_transactions FOR SELECT
USING (matrix_id = get_user_matrix_id());

CREATE POLICY "Users with financeiro write can insert transactions"
ON public.bank_ofx_transactions FOR INSERT
WITH CHECK (
    matrix_id = get_user_matrix_id() 
    AND user_has_permission('financeiro', 'write')
);

CREATE POLICY "Users with financeiro write can update transactions"
ON public.bank_ofx_transactions FOR UPDATE
USING (
    matrix_id = get_user_matrix_id() 
    AND user_has_permission('financeiro', 'write')
);

CREATE POLICY "Users with financeiro admin can delete transactions"
ON public.bank_ofx_transactions FOR DELETE
USING (
    matrix_id = get_user_matrix_id() 
    AND user_has_permission('financeiro', 'admin')
);

-- bank_reconciliations policies
CREATE POLICY "Users can view reconciliations from their matrix"
ON public.bank_reconciliations FOR SELECT
USING (matrix_id = get_user_matrix_id());

CREATE POLICY "Users with financeiro write can insert reconciliations"
ON public.bank_reconciliations FOR INSERT
WITH CHECK (
    matrix_id = get_user_matrix_id() 
    AND user_has_permission('financeiro', 'write')
);

CREATE POLICY "Users with financeiro write can update reconciliations"
ON public.bank_reconciliations FOR UPDATE
USING (
    matrix_id = get_user_matrix_id() 
    AND user_has_permission('financeiro', 'write')
);

CREATE POLICY "Users with financeiro write can delete reconciliations"
ON public.bank_reconciliations FOR DELETE
USING (
    matrix_id = get_user_matrix_id() 
    AND user_has_permission('financeiro', 'write')
);

-- =============================================
-- TRIGGER FOR UPDATED_AT
-- =============================================

CREATE TRIGGER update_bank_ofx_imports_updated_at
    BEFORE UPDATE ON public.bank_ofx_imports
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bank_ofx_transactions_updated_at
    BEFORE UPDATE ON public.bank_ofx_transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bank_reconciliations_updated_at
    BEFORE UPDATE ON public.bank_reconciliations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();