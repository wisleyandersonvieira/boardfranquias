-- Create service_orders table for OS registration
CREATE TABLE public.service_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id),
  os_date DATE NOT NULL,
  registration_date DATE NOT NULL DEFAULT CURRENT_DATE,
  os_number TEXT NOT NULL,
  nf_number TEXT,
  supplier_id UUID REFERENCES public.suppliers(id),
  description TEXT NOT NULL,
  value NUMERIC,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'em_andamento', 'fechada')),
  attachments JSONB DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view service orders for their stores"
ON public.service_orders
FOR SELECT
USING (
  user_has_permission('financeiro', 'read') AND 
  user_has_access_to_store(store_id)
);

CREATE POLICY "Users can manage service orders for their stores"
ON public.service_orders
FOR ALL
USING (
  user_has_permission('financeiro', 'write') AND 
  user_has_access_to_store(store_id)
);

-- Create index for better query performance
CREATE INDEX idx_service_orders_store_id ON public.service_orders(store_id);
CREATE INDEX idx_service_orders_status ON public.service_orders(status);
CREATE INDEX idx_service_orders_registration_date ON public.service_orders(registration_date);
CREATE INDEX idx_service_orders_supplier_id ON public.service_orders(supplier_id);

-- Create trigger for updated_at
CREATE TRIGGER update_service_orders_updated_at
BEFORE UPDATE ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();