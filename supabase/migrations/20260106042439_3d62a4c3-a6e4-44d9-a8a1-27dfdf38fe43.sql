-- Create store_goals table for storing monthly revenue goals per store
CREATE TABLE public.store_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  goal_value NUMERIC(15, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  UNIQUE(store_id, year, month)
);

-- Enable RLS
ALTER TABLE public.store_goals ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view store goals"
ON public.store_goals
FOR SELECT
USING (true);

CREATE POLICY "Users can insert store goals"
ON public.store_goals
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update store goals"
ON public.store_goals
FOR UPDATE
USING (true);

CREATE POLICY "Users can delete store goals"
ON public.store_goals
FOR DELETE
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_store_goals_updated_at
BEFORE UPDATE ON public.store_goals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();