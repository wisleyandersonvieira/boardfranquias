-- Habilita Row Level Security nas tabelas do módulo DRE v2 criadas em 20260415120000.
-- Sem RLS, qualquer usuário autenticado podia ler dados financeiros de todos os stores.

-- ─── dre_estruturas ────────────────────────────────────────────────────────────
-- Configuração de estruturas DRE por brand. Leitura para todos os autenticados,
-- escrita restrita a admin e usuários matriz.
ALTER TABLE public.dre_estruturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read DRE structures"
  ON public.dre_estruturas FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin and matriz manage DRE structures"
  ON public.dre_estruturas FOR ALL
  USING (get_user_role() = 'admin' OR is_matriz_profile_user())
  WITH CHECK (get_user_role() = 'admin' OR is_matriz_profile_user());

-- ─── dre_linhas ────────────────────────────────────────────────────────────────
ALTER TABLE public.dre_linhas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read DRE lines"
  ON public.dre_linhas FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin and matriz manage DRE lines"
  ON public.dre_linhas FOR ALL
  USING (get_user_role() = 'admin' OR is_matriz_profile_user())
  WITH CHECK (get_user_role() = 'admin' OR is_matriz_profile_user());

-- ─── dre_vinculos ──────────────────────────────────────────────────────────────
ALTER TABLE public.dre_vinculos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read DRE vinculos"
  ON public.dre_vinculos FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admin and matriz manage DRE vinculos"
  ON public.dre_vinculos FOR ALL
  USING (get_user_role() = 'admin' OR is_matriz_profile_user())
  WITH CHECK (get_user_role() = 'admin' OR is_matriz_profile_user());

-- ─── dre_logs_auditoria ────────────────────────────────────────────────────────
-- Logs de processamento com métricas operacionais. Apenas admin e matriz.
ALTER TABLE public.dre_logs_auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and matriz access DRE audit logs"
  ON public.dre_logs_auditoria FOR ALL
  USING (get_user_role() = 'admin' OR is_matriz_profile_user())
  WITH CHECK (get_user_role() = 'admin' OR is_matriz_profile_user());

-- ─── dre_snapshots_mensais ─────────────────────────────────────────────────────
-- Snapshots financeiros mensais por store. Dado mais sensível: restrito por store_id.
ALTER TABLE public.dre_snapshots_mensais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access DRE snapshots for their stores"
  ON public.dre_snapshots_mensais FOR ALL
  USING (
    get_user_role() = 'admin'
    OR (store_id IS NOT NULL AND user_has_access_to_store(store_id))
    OR (store_id IS NULL AND is_matriz_profile_user())
  )
  WITH CHECK (
    get_user_role() = 'admin'
    OR (store_id IS NOT NULL AND user_has_access_to_store(store_id))
    OR (store_id IS NULL AND is_matriz_profile_user())
  );
