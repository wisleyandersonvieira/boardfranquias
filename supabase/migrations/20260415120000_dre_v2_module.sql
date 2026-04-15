-- Novo modulo de DRE auditavel.
-- Esta migration adiciona uma modelagem evolutiva isolada para o DRE v2 sem alterar o fluxo legado.

CREATE TABLE IF NOT EXISTS public.dre_estruturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legado_structure_id UUID REFERENCES public.dre_structures(id),
  brand_id UUID REFERENCES public.brands(id),
  nome TEXT NOT NULL,
  descricao TEXT,
  tipo_regime_padrao TEXT NOT NULL DEFAULT 'competencia' CHECK (tipo_regime_padrao IN ('competencia', 'caixa', 'ambos')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dre_linhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estrutura_id UUID NOT NULL REFERENCES public.dre_estruturas(id) ON DELETE CASCADE,
  linha_pai_id UUID REFERENCES public.dre_linhas(id),
  legado_structure_item_id UUID REFERENCES public.dre_structure_items(id),
  descricao TEXT NOT NULL,
  tipo_linha TEXT NOT NULL CHECK (tipo_linha IN ('grupo', 'subgrupo', 'conta', 'subtotal', 'total', 'formula', 'estoque_inicial', 'estoque_final')),
  ordem INTEGER NOT NULL DEFAULT 0,
  nivel INTEGER NOT NULL DEFAULT 0,
  negrito BOOLEAN NOT NULL DEFAULT false,
  colapsavel BOOLEAN NOT NULL DEFAULT false,
  exibir_sinal BOOLEAN NOT NULL DEFAULT true,
  formula_json JSONB,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dre_vinculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  linha_id UUID NOT NULL REFERENCES public.dre_linhas(id) ON DELETE CASCADE,
  origem TEXT NOT NULL,
  categoria_id UUID REFERENCES public.account_groups(id),
  subcategoria_id UUID REFERENCES public.account_groups(id),
  classificacao TEXT,
  natureza TEXT CHECK (natureza IN ('receita', 'despesa', 'deducao', 'cmv', 'outra')),
  observacao_regra TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dre_logs_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estrutura_id UUID REFERENCES public.dre_estruturas(id),
  filtros_json JSONB NOT NULL,
  total_linhas INTEGER NOT NULL DEFAULT 0,
  total_registros_lidos INTEGER NOT NULL DEFAULT 0,
  total_registros_descartados INTEGER NOT NULL DEFAULT 0,
  total_registros_sem_vinculo INTEGER NOT NULL DEFAULT 0,
  tempo_execucao_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dre_snapshots_mensais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estrutura_id UUID NOT NULL REFERENCES public.dre_estruturas(id),
  store_id UUID REFERENCES public.stores(id),
  competencia DATE NOT NULL,
  regime TEXT NOT NULL CHECK (regime IN ('competencia', 'caixa')),
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (estrutura_id, store_id, competencia, regime)
);

CREATE INDEX IF NOT EXISTS idx_dre_linhas_estrutura_ordem ON public.dre_linhas(estrutura_id, ordem);
CREATE INDEX IF NOT EXISTS idx_dre_vinculos_linha ON public.dre_vinculos(linha_id);
CREATE INDEX IF NOT EXISTS idx_dre_logs_auditoria_estrutura_data ON public.dre_logs_auditoria(estrutura_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dre_snapshots_competencia ON public.dre_snapshots_mensais(competencia, regime);

CREATE INDEX IF NOT EXISTS idx_accounts_payable_store_competencia ON public.accounts_payable(store_id, data_competencia);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_store_payment ON public.accounts_payable(store_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_store_competencia ON public.accounts_receivable(store_id, data_competencia);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_store_payment ON public.accounts_receivable(store_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_installments_payment ON public.accounts_payable_installments(account_payable_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_installments_payment ON public.accounts_receivable_installments(account_receivable_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_partner_transactions_store_competencia ON public.partner_transactions(store_id, competence_date);
CREATE INDEX IF NOT EXISTS idx_partner_transactions_store_payment ON public.partner_transactions(store_id, payment_date);
