-- Relatorio de Analise de Produto
-- Agrega variacoes de preco a partir dos itens do Contas a Pagar, sempre
-- validando as lojas solicitadas contra os vinculos do usuario autenticado.

CREATE OR REPLACE FUNCTION public.validate_product_analysis_store_filter(p_store_ids uuid[])
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invalid_count integer;
  normalized_store_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuario nao autenticado' USING ERRCODE = '28000';
  END IF;

  SELECT array_agg(DISTINCT store_id)
  INTO normalized_store_ids
  FROM unnest(p_store_ids) AS store_id
  WHERE store_id IS NOT NULL;

  IF normalized_store_ids IS NULL OR array_length(normalized_store_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Selecione ao menos uma loja' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)
  INTO invalid_count
  FROM unnest(normalized_store_ids) AS store_id
  WHERE NOT public.user_has_access_to_store(store_id);

  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Usuario sem permissao para uma ou mais lojas selecionadas' USING ERRCODE = '42501';
  END IF;

  RETURN normalized_store_ids;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_product_analysis_report(
  p_store_ids uuid[],
  p_start_date date,
  p_end_date date,
  p_variation_limit numeric,
  p_group_id uuid DEFAULT NULL,
  p_subgroup_id uuid DEFAULT NULL
)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  product_code text,
  group_name text,
  subgroup_name text,
  min_unit_price numeric,
  max_unit_price numeric,
  difference_amount numeric,
  variation_percent numeric,
  launch_count bigint,
  store_names text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_store_ids uuid[];
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'Data inicial e data final sao obrigatorias' USING ERRCODE = '22023';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Data final nao pode ser menor que a data inicial' USING ERRCODE = '22023';
  END IF;

  IF p_variation_limit IS NULL OR p_variation_limit < 0 THEN
    RAISE EXCEPTION 'Variacao maxima permitida invalida' USING ERRCODE = '22023';
  END IF;

  allowed_store_ids := public.validate_product_analysis_store_filter(p_store_ids);

  RETURN QUERY
  WITH base_items AS (
    SELECT
      api.product_id,
      p.name AS product_name,
      p.code AS product_code,
      COALESCE(pg.name, parent_group.name) AS group_name,
      sg.name AS subgroup_name,
      api.unit_price,
      s.name AS store_name
    FROM public.accounts_payable_items api
    JOIN public.accounts_payable ap ON ap.id = api.account_payable_id
    JOIN public.products p ON p.id = api.product_id
    LEFT JOIN public.account_groups pg ON pg.id = p.group_id
    LEFT JOIN public.account_groups sg ON sg.id = p.subgroup_id
    LEFT JOIN public.account_groups parent_group ON parent_group.id = sg.parent_id
    JOIN public.stores s ON s.id = api.store_id
    WHERE api.product_id IS NOT NULL
      AND api.unit_price IS NOT NULL
      AND api.unit_price > 0
      AND api.store_id = ANY(allowed_store_ids)
      AND ap.store_id = api.store_id
      AND COALESCE(ap.data_competencia, ap.issue_date, ap.due_date, ap.created_at::date)
        BETWEEN p_start_date AND p_end_date
      AND (p_group_id IS NULL OR p.group_id = p_group_id OR sg.parent_id = p_group_id)
      AND (p_subgroup_id IS NULL OR p.subgroup_id = p_subgroup_id)
  ),
  grouped AS (
    SELECT
      bi.product_id,
      max(bi.product_name) AS product_name,
      max(bi.product_code) AS product_code,
      max(bi.group_name) AS group_name,
      max(bi.subgroup_name) AS subgroup_name,
      min(bi.unit_price) AS min_unit_price,
      max(bi.unit_price) AS max_unit_price,
      count(*) AS launch_count,
      string_agg(DISTINCT bi.store_name, ', ' ORDER BY bi.store_name) AS store_names
    FROM base_items bi
    GROUP BY bi.product_id
  )
  SELECT
    g.product_id,
    g.product_name,
    g.product_code,
    g.group_name,
    g.subgroup_name,
    g.min_unit_price,
    g.max_unit_price,
    g.max_unit_price - g.min_unit_price AS difference_amount,
    ((g.max_unit_price - g.min_unit_price) / g.min_unit_price) * 100 AS variation_percent,
    g.launch_count,
    g.store_names
  FROM grouped g
  WHERE g.launch_count > 1
    AND g.min_unit_price > 0
    AND ((g.max_unit_price - g.min_unit_price) / g.min_unit_price) * 100 > p_variation_limit
  ORDER BY 9 DESC, 2 ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_product_analysis_details(
  p_product_id uuid,
  p_store_ids uuid[],
  p_start_date date,
  p_end_date date,
  p_group_id uuid DEFAULT NULL,
  p_subgroup_id uuid DEFAULT NULL
)
RETURNS TABLE (
  item_id uuid,
  launch_date date,
  store_name text,
  supplier_name text,
  document_number text,
  description text,
  quantity numeric,
  unit_symbol text,
  unit_price numeric,
  total_price numeric,
  product_name text,
  product_code text,
  group_name text,
  subgroup_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_store_ids uuid[];
BEGIN
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'Produto obrigatorio' USING ERRCODE = '22023';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Periodo invalido' USING ERRCODE = '22023';
  END IF;

  allowed_store_ids := public.validate_product_analysis_store_filter(p_store_ids);

  RETURN QUERY
  SELECT
    api.id AS item_id,
    COALESCE(ap.data_competencia, ap.issue_date, ap.due_date, ap.created_at::date) AS launch_date,
    s.name AS store_name,
    sup.name AS supplier_name,
    ap.document_number,
    ap.description,
    api.quantity,
    uom.symbol AS unit_symbol,
    api.unit_price,
    api.total_price,
    p.name AS product_name,
    p.code AS product_code,
    COALESCE(pg.name, parent_group.name) AS group_name,
    sg.name AS subgroup_name
  FROM public.accounts_payable_items api
  JOIN public.accounts_payable ap ON ap.id = api.account_payable_id
  JOIN public.products p ON p.id = api.product_id
  LEFT JOIN public.account_groups pg ON pg.id = p.group_id
  LEFT JOIN public.account_groups sg ON sg.id = p.subgroup_id
  LEFT JOIN public.account_groups parent_group ON parent_group.id = sg.parent_id
  LEFT JOIN public.units_of_measure uom ON uom.id = p.unit_id
  LEFT JOIN public.suppliers sup ON sup.id = ap.supplier_id
  JOIN public.stores s ON s.id = api.store_id
  WHERE api.product_id = p_product_id
    AND api.store_id = ANY(allowed_store_ids)
    AND ap.store_id = api.store_id
    AND COALESCE(ap.data_competencia, ap.issue_date, ap.due_date, ap.created_at::date)
      BETWEEN p_start_date AND p_end_date
    AND (p_group_id IS NULL OR p.group_id = p_group_id OR sg.parent_id = p_group_id)
    AND (p_subgroup_id IS NULL OR p.subgroup_id = p_subgroup_id)
  ORDER BY launch_date ASC, api.unit_price ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_product_analysis_export_details(
  p_product_ids uuid[],
  p_store_ids uuid[],
  p_start_date date,
  p_end_date date,
  p_group_id uuid DEFAULT NULL,
  p_subgroup_id uuid DEFAULT NULL
)
RETURNS TABLE (
  item_id uuid,
  launch_date date,
  store_name text,
  supplier_name text,
  document_number text,
  description text,
  quantity numeric,
  unit_symbol text,
  unit_price numeric,
  total_price numeric,
  product_name text,
  product_code text,
  group_name text,
  subgroup_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_store_ids uuid[];
  normalized_product_ids uuid[];
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Periodo invalido' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT product_id)
  INTO normalized_product_ids
  FROM unnest(p_product_ids) AS product_id
  WHERE product_id IS NOT NULL;

  IF normalized_product_ids IS NULL OR array_length(normalized_product_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  allowed_store_ids := public.validate_product_analysis_store_filter(p_store_ids);

  RETURN QUERY
  SELECT
    api.id AS item_id,
    COALESCE(ap.data_competencia, ap.issue_date, ap.due_date, ap.created_at::date) AS launch_date,
    s.name AS store_name,
    sup.name AS supplier_name,
    ap.document_number,
    ap.description,
    api.quantity,
    uom.symbol AS unit_symbol,
    api.unit_price,
    api.total_price,
    p.name AS product_name,
    p.code AS product_code,
    COALESCE(pg.name, parent_group.name) AS group_name,
    sg.name AS subgroup_name
  FROM public.accounts_payable_items api
  JOIN public.accounts_payable ap ON ap.id = api.account_payable_id
  JOIN public.products p ON p.id = api.product_id
  LEFT JOIN public.account_groups pg ON pg.id = p.group_id
  LEFT JOIN public.account_groups sg ON sg.id = p.subgroup_id
  LEFT JOIN public.account_groups parent_group ON parent_group.id = sg.parent_id
  LEFT JOIN public.units_of_measure uom ON uom.id = p.unit_id
  LEFT JOIN public.suppliers sup ON sup.id = ap.supplier_id
  JOIN public.stores s ON s.id = api.store_id
  WHERE api.product_id = ANY(normalized_product_ids)
    AND api.store_id = ANY(allowed_store_ids)
    AND ap.store_id = api.store_id
    AND COALESCE(ap.data_competencia, ap.issue_date, ap.due_date, ap.created_at::date)
      BETWEEN p_start_date AND p_end_date
    AND (p_group_id IS NULL OR p.group_id = p_group_id OR sg.parent_id = p_group_id)
    AND (p_subgroup_id IS NULL OR p.subgroup_id = p_subgroup_id)
  ORDER BY p.name ASC, 2 ASC, api.unit_price ASC;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_accounts_payable_items_product_store
  ON public.accounts_payable_items(product_id, store_id);

CREATE INDEX IF NOT EXISTS idx_accounts_payable_dates_store
  ON public.accounts_payable(store_id, data_competencia, issue_date, due_date);

GRANT EXECUTE ON FUNCTION public.validate_product_analysis_store_filter(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_analysis_report(uuid[], date, date, numeric, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_analysis_details(uuid, uuid[], date, date, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_analysis_export_details(uuid[], uuid[], date, date, uuid, uuid) TO authenticated;
