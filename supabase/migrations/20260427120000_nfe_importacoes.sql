CREATE TABLE IF NOT EXISTS public.nfe_importacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id),
  matrix_id UUID REFERENCES public.matrices(id),
  usuario_id UUID REFERENCES public.profiles(id),
  fornecedor_id UUID REFERENCES public.suppliers(id),
  contas_pagar_id UUID REFERENCES public.accounts_payable(id),
  numero_nfe TEXT,
  serie TEXT,
  chave_acesso TEXT NOT NULL UNIQUE,
  data_emissao DATE,
  valor_total_nota NUMERIC(14,2),
  valor_total_produtos NUMERIC(14,2),
  vencimentos JSONB NOT NULL DEFAULT '[]'::jsonb,
  arquivo_nome TEXT,
  arquivo_path TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.nfe_importacao_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id UUID NOT NULL REFERENCES public.nfe_importacoes(id) ON DELETE CASCADE,
  produto_id UUID REFERENCES public.products(id),
  codigo_fornecedor TEXT NOT NULL,
  descricao_original_pdf TEXT NOT NULL,
  descricao_limpa TEXT NOT NULL,
  unidade TEXT,
  quantidade NUMERIC(14,4) NOT NULL DEFAULT 0,
  valor_unitario NUMERIC(14,4) NOT NULL DEFAULT 0,
  valor_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  ncm TEXT,
  cst TEXT,
  cfop TEXT,
  valor_icms NUMERIC(14,2),
  valor_ipi NUMERIC(14,2),
  aliquota_icms NUMERIC(8,4),
  aliquota_ipi NUMERIC(8,4),
  status_vinculo TEXT NOT NULL DEFAULT 'nao_vinculado',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nfe_importacoes_store ON public.nfe_importacoes(store_id);
CREATE INDEX IF NOT EXISTS idx_nfe_importacoes_fornecedor ON public.nfe_importacoes(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_nfe_importacao_itens_importacao ON public.nfe_importacao_itens(importacao_id);
CREATE INDEX IF NOT EXISTS idx_nfe_importacao_itens_produto ON public.nfe_importacao_itens(produto_id);

ALTER TABLE public.nfe_importacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nfe_importacao_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view nfe imports for their store"
ON public.nfe_importacoes
FOR SELECT
USING (
  user_has_permission('contas_pagar', 'read') AND
  (get_user_role() = 'admin' OR store_id = get_user_store_id())
);

CREATE POLICY "Users can manage nfe imports for their store"
ON public.nfe_importacoes
FOR ALL
USING (
  user_has_permission('contas_pagar', 'write') AND
  (get_user_role() = 'admin' OR store_id = get_user_store_id())
)
WITH CHECK (
  user_has_permission('contas_pagar', 'write') AND
  (get_user_role() = 'admin' OR store_id = get_user_store_id())
);

CREATE POLICY "Users can view nfe import items for their store"
ON public.nfe_importacao_itens
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.nfe_importacoes ni
    WHERE ni.id = nfe_importacao_itens.importacao_id
      AND user_has_permission('contas_pagar', 'read')
      AND (get_user_role() = 'admin' OR ni.store_id = get_user_store_id())
  )
);

CREATE POLICY "Users can manage nfe import items for their store"
ON public.nfe_importacao_itens
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.nfe_importacoes ni
    WHERE ni.id = nfe_importacao_itens.importacao_id
      AND user_has_permission('contas_pagar', 'write')
      AND (get_user_role() = 'admin' OR ni.store_id = get_user_store_id())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.nfe_importacoes ni
    WHERE ni.id = nfe_importacao_itens.importacao_id
      AND user_has_permission('contas_pagar', 'write')
      AND (get_user_role() = 'admin' OR ni.store_id = get_user_store_id())
  )
);

CREATE TRIGGER update_nfe_importacoes_updated_at
BEFORE UPDATE ON public.nfe_importacoes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_nfe_importacao_itens_updated_at
BEFORE UPDATE ON public.nfe_importacao_itens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
