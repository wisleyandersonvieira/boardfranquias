-- Allow deleting accounts_payable that originated from NFe imports
-- by switching the FK on nfe_importacoes.contas_pagar_id to ON DELETE SET NULL,
-- and reset the import status so the user can regenerate the title.

ALTER TABLE public.nfe_importacoes
  DROP CONSTRAINT IF EXISTS nfe_importacoes_contas_pagar_id_fkey;

ALTER TABLE public.nfe_importacoes
  ADD CONSTRAINT nfe_importacoes_contas_pagar_id_fkey
  FOREIGN KEY (contas_pagar_id)
  REFERENCES public.accounts_payable(id)
  ON DELETE SET NULL;

-- Trigger to revert the import status when its linked accounts_payable is deleted,
-- so the user can generate a new accounts_payable from the NFe import screen.
CREATE OR REPLACE FUNCTION public.revert_nfe_import_status_on_ap_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.nfe_importacoes
     SET status = 'pendente',
         contas_pagar_id = NULL,
         updated_at = now()
   WHERE contas_pagar_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_revert_nfe_import_on_ap_delete ON public.accounts_payable;
CREATE TRIGGER trg_revert_nfe_import_on_ap_delete
BEFORE DELETE ON public.accounts_payable
FOR EACH ROW
EXECUTE FUNCTION public.revert_nfe_import_status_on_ap_delete();