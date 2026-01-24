-- Adicionar a foreign key faltante na tabela cash_control_cash_items
ALTER TABLE public.cash_control_cash_items
ADD CONSTRAINT cash_control_cash_items_cash_account_id_fkey 
FOREIGN KEY (cash_account_id) 
REFERENCES public.cash_accounts(id) 
ON DELETE CASCADE;

ALTER TABLE public.cash_control_cash_items
ADD CONSTRAINT cash_control_cash_items_cash_control_id_fkey 
FOREIGN KEY (cash_control_id) 
REFERENCES public.cash_control(id) 
ON DELETE CASCADE;