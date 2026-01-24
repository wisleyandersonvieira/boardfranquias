-- Criar tabela de matrizes (empresa mãe)
CREATE TABLE public.matrices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  cnpj TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  phone TEXT,
  email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.matrices ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Matrizes são visíveis para usuários autenticados" 
ON public.matrices 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins podem criar matrizes" 
ON public.matrices 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admins podem atualizar matrizes" 
ON public.matrices 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admins podem deletar matrizes" 
ON public.matrices 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_matrices_updated_at
BEFORE UPDATE ON public.matrices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();