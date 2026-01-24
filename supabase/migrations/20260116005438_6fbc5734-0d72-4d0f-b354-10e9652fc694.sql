-- Criar tabela de tipos de documento
CREATE TABLE public.document_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso - leitura para todos autenticados
CREATE POLICY "Authenticated users can view document types"
ON public.document_types
FOR SELECT
TO authenticated
USING (true);

-- Políticas de escrita para quem tem permissão de cadastros
CREATE POLICY "Users with cadastros write permission can insert document types"
ON public.document_types
FOR INSERT
TO authenticated
WITH CHECK (public.has_cadastros_write_permission());

CREATE POLICY "Users with cadastros write permission can update document types"
ON public.document_types
FOR UPDATE
TO authenticated
USING (public.has_cadastros_write_permission());

CREATE POLICY "Users with cadastros write permission can delete document types"
ON public.document_types
FOR DELETE
TO authenticated
USING (public.has_cadastros_write_permission());

-- Trigger para atualizar updated_at
CREATE TRIGGER update_document_types_updated_at
BEFORE UPDATE ON public.document_types
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir tipos de documento padrão
INSERT INTO public.document_types (code, name) VALUES
  ('NF', 'Nota Fiscal'),
  ('RC', 'Recibo'),
  ('CT', 'Contrato'),
  ('CF', 'Cupom Fiscal'),
  ('FAT', 'Fatura'),
  ('HOL', 'Holerite');

-- Comentário na tabela
COMMENT ON TABLE public.document_types IS 'Tabela para armazenar os tipos de documento utilizados em contas a pagar e receber';