-- Create table for partner contributions and withdrawals
CREATE TABLE public.partner_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  account_id UUID NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('current', 'cash', 'card', 'delivery')),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('aporte', 'retirada')),
  payment_date DATE NOT NULL,
  competence_date DATE NOT NULL,
  amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.partner_transactions ENABLE ROW LEVEL SECURITY;

-- Create policies using user_has_permission function
CREATE POLICY "Users can view partner transactions"
ON public.partner_transactions
FOR SELECT
USING (
  user_has_permission('financeiro'::text, 'read'::permission_type) 
  AND user_has_access_to_store(store_id)
);

CREATE POLICY "Users can insert partner transactions"
ON public.partner_transactions
FOR INSERT
WITH CHECK (
  user_has_permission('financeiro'::text, 'write'::permission_type) 
  AND user_has_access_to_store(store_id)
);

CREATE POLICY "Users can update partner transactions"
ON public.partner_transactions
FOR UPDATE
USING (
  user_has_permission('financeiro'::text, 'write'::permission_type) 
  AND user_has_access_to_store(store_id)
);

CREATE POLICY "Users can delete partner transactions"
ON public.partner_transactions
FOR DELETE
USING (
  user_has_permission('financeiro'::text, 'write'::permission_type) 
  AND user_has_access_to_store(store_id)
);

-- Create indexes
CREATE INDEX idx_partner_transactions_store ON public.partner_transactions(store_id);
CREATE INDEX idx_partner_transactions_partner ON public.partner_transactions(partner_id);
CREATE INDEX idx_partner_transactions_payment_date ON public.partner_transactions(payment_date);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_partner_transactions_updated_at
BEFORE UPDATE ON public.partner_transactions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();