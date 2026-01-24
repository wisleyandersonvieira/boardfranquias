-- Add updated_by column to accounts_payable table
ALTER TABLE public.accounts_payable ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES public.profiles(id);

-- Create or replace function to track who updated the record
CREATE OR REPLACE FUNCTION public.set_updated_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_by = auth.uid();
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS set_accounts_payable_updated_by ON public.accounts_payable;

-- Create trigger to automatically set updated_by on update
CREATE TRIGGER set_accounts_payable_updated_by
BEFORE UPDATE ON public.accounts_payable
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_by();