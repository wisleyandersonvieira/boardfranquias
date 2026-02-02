-- Add updated_by column to service_orders table
ALTER TABLE public.service_orders 
ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

-- Add updated_at column if not exists
ALTER TABLE public.service_orders 
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();