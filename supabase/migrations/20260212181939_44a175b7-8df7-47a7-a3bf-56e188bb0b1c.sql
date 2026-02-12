
-- Add created_by and updated_by columns to suppliers table
ALTER TABLE public.suppliers ADD COLUMN created_by uuid;
ALTER TABLE public.suppliers ADD COLUMN updated_by uuid;

-- Create trigger for automatic updated_by tracking
CREATE TRIGGER set_suppliers_updated_by
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_by();
