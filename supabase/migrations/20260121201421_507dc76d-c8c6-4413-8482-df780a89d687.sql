-- Create partners (sócios) table
CREATE TABLE public.partners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  cpf TEXT,
  birth_date DATE,
  email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view partners" 
ON public.partners 
FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Users with write permission can insert partners" 
ON public.partners 
FOR INSERT 
WITH CHECK (has_cadastros_write_permission());

CREATE POLICY "Users with write permission can update partners" 
ON public.partners 
FOR UPDATE 
USING (has_cadastros_write_permission());

CREATE POLICY "Users with write permission can delete partners" 
ON public.partners 
FOR DELETE 
USING (has_cadastros_write_permission());

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_partners_updated_at
BEFORE UPDATE ON public.partners
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();