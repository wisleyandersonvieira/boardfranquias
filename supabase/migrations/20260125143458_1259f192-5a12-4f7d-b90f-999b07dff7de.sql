-- Criar tabela de marcas
CREATE TABLE public.brands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact TEXT,
  matrix_id UUID NOT NULL REFERENCES public.matrices(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

-- Política: Apenas usuários da mesma matriz podem visualizar marcas
CREATE POLICY "Users can view brands in their matrix"
ON public.brands
FOR SELECT
USING (matrix_id = get_user_matrix_id());

-- Política: Apenas usuários da mesma matriz podem inserir marcas
CREATE POLICY "Users can insert brands in their matrix"
ON public.brands
FOR INSERT
WITH CHECK (matrix_id = get_user_matrix_id());

-- Política: Apenas usuários da mesma matriz podem atualizar marcas
CREATE POLICY "Users can update brands in their matrix"
ON public.brands
FOR UPDATE
USING (matrix_id = get_user_matrix_id());

-- Política: Apenas usuários da mesma matriz podem deletar marcas
CREATE POLICY "Users can delete brands in their matrix"
ON public.brands
FOR DELETE
USING (matrix_id = get_user_matrix_id());

-- Trigger para atualizar updated_at
CREATE TRIGGER update_brands_updated_at
BEFORE UPDATE ON public.brands
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();