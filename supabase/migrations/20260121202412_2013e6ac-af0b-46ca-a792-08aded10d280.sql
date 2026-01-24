-- Create junction table for store-partner relationship
CREATE TABLE public.store_partners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(store_id, partner_id)
);

-- Enable RLS
ALTER TABLE public.store_partners ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view store partners" 
ON public.store_partners 
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Users with cadastros write permission can insert store partners" 
ON public.store_partners 
FOR INSERT 
TO authenticated
WITH CHECK (has_cadastros_write_permission());

CREATE POLICY "Users with cadastros write permission can update store partners" 
ON public.store_partners 
FOR UPDATE 
TO authenticated
USING (has_cadastros_write_permission());

CREATE POLICY "Users with cadastros write permission can delete store partners" 
ON public.store_partners 
FOR DELETE 
TO authenticated
USING (has_cadastros_write_permission());

-- Add trigger for updated_at
CREATE TRIGGER update_store_partners_updated_at
BEFORE UPDATE ON public.store_partners
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();