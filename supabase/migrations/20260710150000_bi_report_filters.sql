-- BI Gerencial - filtros por loja, fornecedor, grupo e subgrupo.
--
-- Os quatro filtros sao multi-selecao (uuid[]) e opcionais. NULL ou array vazio
-- significam "sem filtro", entao as chamadas antigas continuam valendo.
--
-- Onde cada filtro atua:
--   loja / fornecedor -> no cabecalho do lancamento (accounts_payable), antes do
--                        join com os itens. Continua valendo a linha residual
--                        "Sem produto", entao o total segue batendo com o
--                        Contas a Pagar filtrado pelas mesmas lojas/fornecedores.
--   grupo / subgrupo  -> no produto do item. A linha residual NAO tem produto e,
--                        portanto, nao tem grupo: quando um desses filtros esta
--                        ativo ela e omitida e o total passa a ser apenas o dos
--                        itens que casam com o filtro. A tela avisa o usuario.
--
-- Fornecedor: o filtro casa contra accounts_payable.supplier_id. Lancamentos de
-- funcionario (employee_id) ficam de fora quando ha filtro de fornecedor, que e
-- o comportamento esperado de "filtrar por fornecedor".

-- As assinaturas mudam, entao e preciso dropar antes (os novos parametros com
-- DEFAULT criariam sobrecargas ambiguas com as versoes antigas).
DROP FUNCTION IF EXISTS public.get_bi_report(text, date, date, text[], text, text, integer, integer);
DROP FUNCTION IF EXISTS public.get_bi_report_totals(text, date, date);
DROP FUNCTION IF EXISTS public.get_bi_fact_rows(text, date, date);

-- Linhas-fato ja normalizadas (uma linha por item + linha residual por lancamento).
CREATE OR REPLACE FUNCTION public.get_bi_fact_rows(
  p_date_type text,
  p_start_date date,
  p_end_date date,
  p_store_ids uuid[] DEFAULT NULL,
  p_supplier_ids uuid[] DEFAULT NULL,
  p_group_ids uuid[] DEFAULT NULL,
  p_subgroup_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  store_name text,
  supplier_name text,
  group_name text,
  subgroup_name text,
  product_name text,
  quantity numeric,
  value numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_store_ids uuid[];
  f_store_ids uuid[];
  f_supplier_ids uuid[];
  f_group_ids uuid[];
  f_subgroup_ids uuid[];
  has_product_filter boolean;
BEGIN
  IF p_date_type IS NULL OR p_date_type NOT IN ('competence_date', 'payment_date') THEN
    RAISE EXCEPTION 'Tipo de data invalido' USING ERRCODE = '22023';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Data inicial e data final sao obrigatorias' USING ERRCODE = '22023';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Data final nao pode ser menor que a data inicial' USING ERRCODE = '22023';
  END IF;

  -- Array vazio e o mesmo que "sem filtro".
  f_store_ids    := CASE WHEN array_length(p_store_ids, 1)    IS NULL THEN NULL ELSE p_store_ids    END;
  f_supplier_ids := CASE WHEN array_length(p_supplier_ids, 1) IS NULL THEN NULL ELSE p_supplier_ids END;
  f_group_ids    := CASE WHEN array_length(p_group_ids, 1)    IS NULL THEN NULL ELSE p_group_ids    END;
  f_subgroup_ids := CASE WHEN array_length(p_subgroup_ids, 1) IS NULL THEN NULL ELSE p_subgroup_ids END;

  has_product_filter := f_group_ids IS NOT NULL OR f_subgroup_ids IS NOT NULL;

  allowed_store_ids := public.get_bi_accessible_store_ids();

  IF array_length(allowed_store_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH headers AS (
    SELECT
      ap.id,
      ap.store_id,
      ap.supplier_id,
      ap.employee_id,
      COALESCE(NULLIF(ap.total_amount, 0), ap.amount, 0)::numeric AS header_value
    FROM public.accounts_payable ap
    WHERE ap.store_id = ANY(allowed_store_ids)
      AND (f_store_ids IS NULL OR ap.store_id = ANY(f_store_ids))
      AND (f_supplier_ids IS NULL OR ap.supplier_id = ANY(f_supplier_ids))
      AND (
        p_date_type <> 'competence_date'
        OR COALESCE(ap.data_competencia, ap.issue_date, ap.due_date, ap.created_at::date)
             BETWEEN p_start_date AND p_end_date
      )
  ),
  -- Parcelas quitadas no periodo, agregadas por lancamento (evita fan-out com os itens).
  paid AS (
    SELECT i.account_payable_id AS id, SUM(i.amount)::numeric AS paid_amount
    FROM public.accounts_payable_installments i
    JOIN headers h ON h.id = i.account_payable_id
    WHERE p_date_type = 'payment_date'
      AND i.payment_date BETWEEN p_start_date AND p_end_date
    GROUP BY i.account_payable_id

    UNION ALL

    -- Lancamentos quitados sem parcelas: usa a data de pagamento do cabecalho.
    SELECT h.id, h.header_value
    FROM headers h
    JOIN public.accounts_payable ap ON ap.id = h.id
    WHERE p_date_type = 'payment_date'
      AND ap.payment_date BETWEEN p_start_date AND p_end_date
      AND NOT EXISTS (
        SELECT 1 FROM public.accounts_payable_installments i2
        WHERE i2.account_payable_id = h.id
      )
  ),
  scoped AS (
    SELECT
      h.*,
      CASE WHEN p_date_type = 'payment_date' THEN pd.paid_amount ELSE h.header_value END AS effective_value
    FROM headers h
    LEFT JOIN paid pd ON pd.id = h.id
    WHERE p_date_type = 'competence_date' OR pd.id IS NOT NULL
  ),
  items_total AS (
    SELECT api.account_payable_id AS id, SUM(api.total_price)::numeric AS items_value
    FROM public.accounts_payable_items api
    JOIN scoped s ON s.id = api.account_payable_id AND s.store_id = api.store_id
    GROUP BY api.account_payable_id
  ),
  weighted AS (
    SELECT
      s.id,
      s.store_id,
      s.supplier_id,
      s.employee_id,
      s.header_value,
      s.effective_value,
      COALESCE(it.items_value, 0) AS items_value,
      CASE
        WHEN p_date_type = 'competence_date' THEN 1::numeric
        WHEN s.header_value = 0 THEN 0::numeric
        ELSE s.effective_value / s.header_value
      END AS weight
    FROM scoped s
    LEFT JOIN items_total it ON it.id = s.id
  )
  -- Linhas de item
  SELECT
    st.name::text,
    COALESCE(sup.name, emp.name, 'Sem fornecedor')::text,
    COALESCE(pg.name, parent_group.name, 'Sem grupo')::text,
    COALESCE(sg.name, 'Sem subgrupo')::text,
    p.name::text,
    (api.quantity * w.weight)::numeric,
    (api.total_price * w.weight)::numeric
  FROM weighted w
  JOIN public.accounts_payable_items api
    ON api.account_payable_id = w.id AND api.store_id = w.store_id
  JOIN public.products p ON p.id = api.product_id
  LEFT JOIN public.account_groups pg ON pg.id = p.group_id
  LEFT JOIN public.account_groups sg ON sg.id = p.subgroup_id
  LEFT JOIN public.account_groups parent_group ON parent_group.id = sg.parent_id
  JOIN public.stores st ON st.id = w.store_id
  LEFT JOIN public.suppliers sup ON sup.id = w.supplier_id
  LEFT JOIN public.employees emp ON emp.id = w.employee_id
  WHERE w.weight <> 0
    -- O grupo efetivo do produto e o group_id proprio ou, na falta dele, o pai do subgrupo.
    AND (f_group_ids IS NULL OR COALESCE(p.group_id, sg.parent_id) = ANY(f_group_ids))
    AND (f_subgroup_ids IS NULL OR p.subgroup_id = ANY(f_subgroup_ids))

  UNION ALL

  -- Linha residual: o que o lancamento tem alem dos itens (frete, servico, sem itens).
  -- Nao tem produto, logo nao tem grupo: sai de cena quando ha filtro de grupo/subgrupo.
  SELECT
    st.name::text,
    COALESCE(sup.name, emp.name, 'Sem fornecedor')::text,
    'Sem grupo'::text,
    'Sem subgrupo'::text,
    'Sem produto'::text,
    NULL::numeric,
    (w.effective_value - w.items_value * w.weight)::numeric
  FROM weighted w
  JOIN public.stores st ON st.id = w.store_id
  LEFT JOIN public.suppliers sup ON sup.id = w.supplier_id
  LEFT JOIN public.employees emp ON emp.id = w.employee_id
  WHERE NOT has_product_filter
    AND round(w.effective_value - w.items_value * w.weight, 2) <> 0;
END;
$$;

-- Cubo: agrupa as linhas-fato pelas dimensoes selecionadas.
-- As colunas nao selecionadas viram NULL constante, colapsando o GROUP BY.
-- Nao ha SQL dinamico: p_columns e validado contra a whitelist e usado apenas em CASE.
CREATE OR REPLACE FUNCTION public.get_bi_report(
  p_date_type text,
  p_start_date date,
  p_end_date date,
  p_columns text[],
  p_sort_column text DEFAULT NULL,
  p_sort_direction text DEFAULT 'desc',
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_store_ids uuid[] DEFAULT NULL,
  p_supplier_ids uuid[] DEFAULT NULL,
  p_group_ids uuid[] DEFAULT NULL,
  p_subgroup_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  store_name text,
  supplier_name text,
  group_name text,
  subgroup_name text,
  product_name text,
  total_quantity numeric,
  total_value numeric,
  total_rows bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_columns constant text[] := ARRAY['store', 'supplier', 'group', 'subgroup', 'product', 'quantity', 'value'];
  invalid_column text;
  cols text[];
  sort_col text;
  sort_dir text;
  row_limit integer;
  row_offset integer;
BEGIN
  IF p_columns IS NULL OR array_length(p_columns, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecione ao menos uma coluna' USING ERRCODE = '22023';
  END IF;

  SELECT c INTO invalid_column
  FROM unnest(p_columns) AS c
  WHERE c <> ALL(allowed_columns)
  LIMIT 1;

  IF invalid_column IS NOT NULL THEN
    RAISE EXCEPTION 'Coluna invalida: %', invalid_column USING ERRCODE = '22023';
  END IF;

  cols := p_columns;
  sort_dir := CASE WHEN lower(COALESCE(p_sort_direction, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  sort_col := COALESCE(p_sort_column, CASE WHEN 'value' = ANY(cols) THEN 'value' ELSE cols[1] END);

  IF sort_col <> ALL(allowed_columns) THEN
    RAISE EXCEPTION 'Coluna de ordenacao invalida: %', sort_col USING ERRCODE = '22023';
  END IF;

  -- Ordenar por uma coluna nao selecionada nao faz sentido no cubo.
  IF sort_col <> ALL(cols) THEN
    sort_col := cols[1];
  END IF;

  row_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 1000);
  row_offset := GREATEST(COALESCE(p_offset, 0), 0);

  RETURN QUERY
  WITH facts AS (
    SELECT * FROM public.get_bi_fact_rows(
      p_date_type, p_start_date, p_end_date,
      p_store_ids, p_supplier_ids, p_group_ids, p_subgroup_ids
    )
  ),
  grouped AS (
    SELECT
      CASE WHEN 'store' = ANY(cols) THEN f.store_name END AS store_name,
      CASE WHEN 'supplier' = ANY(cols) THEN f.supplier_name END AS supplier_name,
      CASE WHEN 'group' = ANY(cols) THEN f.group_name END AS group_name,
      CASE WHEN 'subgroup' = ANY(cols) THEN f.subgroup_name END AS subgroup_name,
      CASE WHEN 'product' = ANY(cols) THEN f.product_name END AS product_name,
      SUM(f.quantity) AS total_quantity,
      SUM(f.value) AS total_value
    FROM facts f
    GROUP BY 1, 2, 3, 4, 5
  )
  SELECT
    g.store_name,
    g.supplier_name,
    g.group_name,
    g.subgroup_name,
    g.product_name,
    CASE WHEN 'quantity' = ANY(cols) THEN g.total_quantity END,
    CASE WHEN 'value' = ANY(cols) THEN g.total_value END,
    count(*) OVER () AS total_rows
  FROM grouped g
  ORDER BY
    (CASE WHEN sort_dir = 'asc' THEN
      CASE sort_col
        WHEN 'store' THEN g.store_name
        WHEN 'supplier' THEN g.supplier_name
        WHEN 'group' THEN g.group_name
        WHEN 'subgroup' THEN g.subgroup_name
        WHEN 'product' THEN g.product_name
      END
    END) ASC NULLS LAST,
    (CASE WHEN sort_dir = 'desc' THEN
      CASE sort_col
        WHEN 'store' THEN g.store_name
        WHEN 'supplier' THEN g.supplier_name
        WHEN 'group' THEN g.group_name
        WHEN 'subgroup' THEN g.subgroup_name
        WHEN 'product' THEN g.product_name
      END
    END) DESC NULLS LAST,
    (CASE WHEN sort_dir = 'asc' THEN
      CASE sort_col
        WHEN 'quantity' THEN g.total_quantity
        WHEN 'value' THEN g.total_value
      END
    END) ASC NULLS LAST,
    (CASE WHEN sort_dir = 'desc' THEN
      CASE sort_col
        WHEN 'quantity' THEN g.total_quantity
        WHEN 'value' THEN g.total_value
      END
    END) DESC NULLS LAST,
    g.store_name NULLS LAST,
    g.supplier_name NULLS LAST,
    g.group_name NULLS LAST,
    g.subgroup_name NULLS LAST,
    g.product_name NULLS LAST
  LIMIT row_limit OFFSET row_offset;
END;
$$;

-- Cards de resumo: mesmos filtros da tabela, independentes das colunas selecionadas.
CREATE OR REPLACE FUNCTION public.get_bi_report_totals(
  p_date_type text,
  p_start_date date,
  p_end_date date,
  p_store_ids uuid[] DEFAULT NULL,
  p_supplier_ids uuid[] DEFAULT NULL,
  p_group_ids uuid[] DEFAULT NULL,
  p_subgroup_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  total_value numeric,
  total_quantity numeric,
  supplier_count bigint,
  product_count bigint,
  store_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(f.value), 0)::numeric,
    COALESCE(SUM(f.quantity), 0)::numeric,
    count(DISTINCT f.supplier_name) FILTER (WHERE f.supplier_name <> 'Sem fornecedor'),
    count(DISTINCT f.product_name) FILTER (WHERE f.product_name <> 'Sem produto'),
    count(DISTINCT f.store_name)
  FROM public.get_bi_fact_rows(
    p_date_type, p_start_date, p_end_date,
    p_store_ids, p_supplier_ids, p_group_ids, p_subgroup_ids
  ) f;
END;
$$;

-- Indices de apoio aos novos filtros.
CREATE INDEX IF NOT EXISTS idx_accounts_payable_store
  ON public.accounts_payable(store_id);

REVOKE EXECUTE ON FUNCTION public.get_bi_fact_rows(text, date, date, uuid[], uuid[], uuid[], uuid[]) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_bi_report(text, date, date, text[], text, text, integer, integer, uuid[], uuid[], uuid[], uuid[]) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_bi_report_totals(text, date, date, uuid[], uuid[], uuid[], uuid[]) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.get_bi_fact_rows(text, date, date, uuid[], uuid[], uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bi_report(text, date, date, text[], text, text, integer, integer, uuid[], uuid[], uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bi_report_totals(text, date, date, uuid[], uuid[], uuid[], uuid[]) TO authenticated;
