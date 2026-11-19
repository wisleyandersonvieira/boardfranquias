import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MultiSelectFilter, MultiSelectOption } from "@/components/page/MultiSelectFilter";
import {
  AlertTriangle,
  ChevronDown,
  Eraser,
  FileSpreadsheet,
  FileText,
  Loader2,
  Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addPdfHeaderWithLogo, renderPdfHeader } from "@/utils/pdfHeader";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

type RpcResponse<T> = Promise<{ data: T[] | null; error: Error | null }>;
type RpcClient = {
  rpc: <T>(functionName: string, args: Record<string, unknown>) => RpcResponse<T>;
};

const rpcClient = supabase as unknown as RpcClient;

type DateType = "competence_date" | "payment_date";
type ColumnKey = "store" | "supplier" | "group" | "subgroup" | "product" | "quantity" | "value";
type SortDirection = "asc" | "desc";

type BIRow = {
  store_name: string | null;
  supplier_name: string | null;
  group_name: string | null;
  subgroup_name: string | null;
  product_name: string | null;
  total_quantity: number | null;
  total_value: number | null;
  total_rows: number;
};

type BITotals = {
  total_value: number;
  total_quantity: number;
  supplier_count: number;
  product_count: number;
  store_count: number;
};

type AppliedFilters = {
  date_type: DateType;
  start_date: string;
  end_date: string;
  columns: ColumnKey[];
  store_ids: string[];
  supplier_ids: string[];
  group_ids: string[];
  subgroup_ids: string[];
};

type GroupOption = MultiSelectOption & { parentId: string | null };

// A ordem aqui define a ordem das colunas na tabela e nas exportacoes.
const COLUMN_DEFS: { key: ColumnKey; label: string; numeric: boolean; field: keyof BIRow }[] = [
  { key: "store", label: "Loja", numeric: false, field: "store_name" },
  { key: "supplier", label: "Fornecedor", numeric: false, field: "supplier_name" },
  { key: "group", label: "Grupo", numeric: false, field: "group_name" },
  { key: "subgroup", label: "Sub Grupo", numeric: false, field: "subgroup_name" },
  { key: "product", label: "Produto", numeric: false, field: "product_name" },
  { key: "quantity", label: "Quantidade", numeric: true, field: "total_quantity" },
  { key: "value", label: "Valor", numeric: true, field: "total_value" },
];

const QUICK_VIEWS: { label: string; columns: ColumnKey[] }[] = [
  { label: "Visão por Loja", columns: ["store", "value"] },
  { label: "Visão por Fornecedor", columns: ["store", "supplier", "value"] },
  { label: "Visão por Grupo", columns: ["store", "group", "subgroup", "value"] },
  { label: "Visão por Produto", columns: ["store", "product", "quantity", "value"] },
  { label: "Visão Completa", columns: ["store", "supplier", "group", "subgroup", "product", "quantity", "value"] },
];

const DEFAULT_COLUMNS: ColumnKey[] = ["store", "group", "value"];
const PAGE_SIZE = 50;
const EXPORT_BATCH = 1000;

// Um array vazio significa "sem filtro" para as funcoes do banco.
const asFilterArray = (values: string[]) => (values.length > 0 ? values : null);

// Os argumentos que as tres funcoes do BI compartilham: periodo + dimensoes filtradas.
const rpcFilterArgs = (filters: AppliedFilters) => ({
  p_date_type: filters.date_type,
  p_start_date: filters.start_date,
  p_end_date: filters.end_date,
  p_store_ids: asFilterArray(filters.store_ids),
  p_supplier_ids: asFilterArray(filters.supplier_ids),
  p_group_ids: asFilterArray(filters.group_ids),
  p_subgroup_ids: asFilterArray(filters.subgroup_ids),
});

const sortColumns = (columns: ColumnKey[]): ColumnKey[] =>
  COLUMN_DEFS.filter((def) => columns.includes(def.key)).map((def) => def.key);

const currency = (value: number | null) =>
  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const quantity = (value: number | null) =>
  value === null || value === undefined
    ? "-"
    : Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });

const datePtBr = (date: string) => (date ? new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR") : "-");

const currentMonthRange = () => {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: iso(first), end: iso(last) };
};

/**
 * Analise detalhada de despesas (tabela dinamica do BI original).
 * Renderizada como uma aba do painel em src/pages/BIReport.tsx.
 */
const BIDetailedAnalysis = () => {
  const monthRange = useMemo(currentMonthRange, []);

  const [dateType, setDateType] = useState<DateType>("competence_date");
  const [startDate, setStartDate] = useState(monthRange.start);
  const [endDate, setEndDate] = useState(monthRange.end);
  const [selectedColumns, setSelectedColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [subgroupIds, setSubgroupIds] = useState<string[]>([]);

  const [storeOptions, setStoreOptions] = useState<MultiSelectOption[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<MultiSelectOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<MultiSelectOption[]>([]);
  const [subgroupOptions, setSubgroupOptions] = useState<GroupOption[]>([]);

  const [applied, setApplied] = useState<AppliedFilters | null>(null);
  const [rows, setRows] = useState<BIRow[]>([]);
  const [totals, setTotals] = useState<BITotals | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPage] = useState(0);
  const [sortColumn, setSortColumn] = useState<ColumnKey>("value");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const visibleColumns = useMemo(
    () => COLUMN_DEFS.filter((def) => (applied?.columns ?? DEFAULT_COLUMNS).includes(def.key)),
    [applied],
  );

  const toggleColumn = (key: ColumnKey) => {
    setSelectedColumns((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : sortColumns([...prev, key]),
    );
  };

  // Opcoes dos filtros. As lojas vem da mesma funcao que o BI usa para limitar
  // o relatorio, entao o combo nunca oferece uma loja que o usuario nao ve.
  useEffect(() => {
    const loadOptions = async () => {
      try {
        const { data: allowedStoreIds, error: storeIdsError } =
          await rpcClient.rpc<string>("get_bi_accessible_store_ids", {});
        if (storeIdsError) throw storeIdsError;

        const [storesResult, suppliersResult, groupsResult] = await Promise.all([
          supabase
            .from("stores")
            .select("id, name")
            .in("id", allowedStoreIds ?? [])
            .order("name"),
          supabase.from("suppliers").select("id, name").order("name"),
          supabase.from("account_groups").select("id, name, parent_id").order("name"),
        ]);

        setStoreOptions((storesResult.data ?? []).map((s) => ({ value: s.id, label: s.name })));
        setSupplierOptions((suppliersResult.data ?? []).map((s) => ({ value: s.id, label: s.name })));

        const allGroups = groupsResult.data ?? [];
        setGroupOptions(
          allGroups.filter((g) => g.parent_id === null).map((g) => ({ value: g.id, label: g.name })),
        );
        setSubgroupOptions(
          allGroups
            .filter((g) => g.parent_id !== null)
            .map((g) => ({ value: g.id, label: g.name, parentId: g.parent_id })),
        );
      } catch (error) {
        console.error("Erro ao carregar opções de filtro do BI:", error);
        toast({
          title: "Filtros indisponíveis",
          description: "Não foi possível carregar lojas, fornecedores e grupos.",
          variant: "destructive",
        });
      }
    };

    void loadOptions();
  }, []);

  // Ao escolher grupos, o combo de subgrupo passa a listar só os filhos deles.
  const visibleSubgroupOptions = useMemo(
    () =>
      groupIds.length === 0
        ? subgroupOptions
        : subgroupOptions.filter((sg) => sg.parentId !== null && groupIds.includes(sg.parentId)),
    [subgroupOptions, groupIds],
  );

  // ...e os subgrupos ja selecionados que nao pertencem mais aos grupos escolhidos saem.
  useEffect(() => {
    if (groupIds.length === 0 || subgroupIds.length === 0) return;
    const allowed = new Set(visibleSubgroupOptions.map((sg) => sg.value));
    const next = subgroupIds.filter((id) => allowed.has(id));
    if (next.length !== subgroupIds.length) setSubgroupIds(next);
  }, [groupIds, subgroupIds, visibleSubgroupOptions]);

  const fetchPage = useCallback(
    async (filters: AppliedFilters, pageIndex: number, sortCol: ColumnKey, sortDir: SortDirection) => {
      setLoading(true);
      setErrorMessage(null);
      try {
        const [reportResult, totalsResult] = await Promise.all([
          rpcClient.rpc<BIRow>("get_bi_report", {
            ...rpcFilterArgs(filters),
            p_columns: filters.columns,
            p_sort_column: sortCol,
            p_sort_direction: sortDir,
            p_limit: PAGE_SIZE,
            p_offset: pageIndex * PAGE_SIZE,
          }),
          rpcClient.rpc<BITotals>("get_bi_report_totals", rpcFilterArgs(filters)),
        ]);

        if (reportResult.error) throw reportResult.error;
        if (totalsResult.error) throw totalsResult.error;

        const data = reportResult.data ?? [];
        setRows(data);
        setTotalRows(data.length > 0 ? Number(data[0].total_rows) : 0);
        setTotals(totalsResult.data?.[0] ?? null);
      } catch (error) {
        console.error("Erro ao carregar BI:", error);
        setRows([]);
        setTotals(null);
        setTotalRows(0);
        setErrorMessage("Não foi possível carregar o relatório. Tente novamente ou ajuste os filtros.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const validate = () => {
    if (!startDate || !endDate) {
      toast({ title: "Período obrigatório", description: "Informe data inicial e data final.", variant: "destructive" });
      return false;
    }
    if (endDate < startDate) {
      toast({
        title: "Período inválido",
        description: "A data final não pode ser menor que a data inicial.",
        variant: "destructive",
      });
      return false;
    }
    if (selectedColumns.length === 0) {
      toast({
        title: "Selecione as colunas",
        description: "Escolha ao menos uma coluna para montar o relatório.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleApply = () => {
    if (!validate()) return;
    const columns = sortColumns(selectedColumns);
    const nextSort: ColumnKey = columns.includes(sortColumn)
      ? sortColumn
      : columns.includes("value")
        ? "value"
        : columns[0];
    const filters: AppliedFilters = {
      date_type: dateType,
      start_date: startDate,
      end_date: endDate,
      columns,
      store_ids: storeIds,
      supplier_ids: supplierIds,
      group_ids: groupIds,
      subgroup_ids: subgroupIds,
    };
    setApplied(filters);
    setPage(0);
    setSortColumn(nextSort);
    void fetchPage(filters, 0, nextSort, sortDirection);
  };

  const handleClear = () => {
    setDateType("competence_date");
    setStartDate(monthRange.start);
    setEndDate(monthRange.end);
    setSelectedColumns(DEFAULT_COLUMNS);
    setStoreIds([]);
    setSupplierIds([]);
    setGroupIds([]);
    setSubgroupIds([]);
  };

  const changeSort = (key: ColumnKey) => {
    if (!applied) return;
    const isNumeric = COLUMN_DEFS.find((def) => def.key === key)?.numeric ?? false;
    const nextDirection: SortDirection =
      sortColumn === key ? (sortDirection === "asc" ? "desc" : "asc") : isNumeric ? "desc" : "asc";
    setSortColumn(key);
    setSortDirection(nextDirection);
    setPage(0);
    void fetchPage(applied, 0, key, nextDirection);
  };

  const changePage = (nextPage: number) => {
    if (!applied) return;
    setPage(nextPage);
    void fetchPage(applied, nextPage, sortColumn, sortDirection);
  };

  // Visao padrao ao entrar na tela: Loja + Grupo + Valor, mes atual por competencia.
  useEffect(() => {
    const filters: AppliedFilters = {
      date_type: "competence_date",
      start_date: monthRange.start,
      end_date: monthRange.end,
      columns: DEFAULT_COLUMNS,
      store_ids: [],
      supplier_ids: [],
      group_ids: [],
      subgroup_ids: [],
    };
    setApplied(filters);
    void fetchPage(filters, 0, "value", "desc");
  }, [fetchPage, monthRange]);

  // As exportacoes precisam de TODAS as linhas, nao apenas da pagina atual.
  const fetchAllRows = async (filters: AppliedFilters): Promise<BIRow[]> => {
    const all: BIRow[] = [];
    let offset = 0;
    for (;;) {
      const { data, error } = await rpcClient.rpc<BIRow>("get_bi_report", {
        ...rpcFilterArgs(filters),
        p_columns: filters.columns,
        p_sort_column: sortColumn,
        p_sort_direction: sortDirection,
        p_limit: EXPORT_BATCH,
        p_offset: offset,
      });
      if (error) throw error;
      const batch = data ?? [];
      all.push(...batch);
      if (batch.length < EXPORT_BATCH || all.length >= Number(batch[0]?.total_rows ?? 0)) break;
      offset += EXPORT_BATCH;
    }
    return all;
  };

  const columnTotals = (data: BIRow[]) => ({
    quantity: data.reduce((sum, row) => sum + Number(row.total_quantity || 0), 0),
    value: data.reduce((sum, row) => sum + Number(row.total_value || 0), 0),
  });

  const labelsOf = (options: MultiSelectOption[], ids: string[]) =>
    ids.map((id) => options.find((o) => o.value === id)?.label ?? id).join(", ");

  // Vai para a tela e para o cabecalho das exportacoes.
  const filterSummary = (filters: AppliedFilters) => {
    const parts = [
      `${filters.date_type === "competence_date" ? "Data de competência" : "Data de pagamento"}: ${datePtBr(
        filters.start_date,
      )} a ${datePtBr(filters.end_date)}`,
    ];
    if (filters.store_ids.length) parts.push(`Lojas: ${labelsOf(storeOptions, filters.store_ids)}`);
    if (filters.supplier_ids.length) parts.push(`Fornecedores: ${labelsOf(supplierOptions, filters.supplier_ids)}`);
    if (filters.group_ids.length) parts.push(`Grupos: ${labelsOf(groupOptions, filters.group_ids)}`);
    if (filters.subgroup_ids.length) parts.push(`Subgrupos: ${labelsOf(subgroupOptions, filters.subgroup_ids)}`);
    return parts.join(" · ");
  };

  const handleExportExcel = async () => {
    if (!applied || totalRows === 0) return;
    setExporting(true);
    try {
      const data = await fetchAllRows(applied);
      const columns = COLUMN_DEFS.filter((def) => applied.columns.includes(def.key));
      const sums = columnTotals(data);

      const sheetRows = data.map((row) => {
        const record: Record<string, string | number | null> = {};
        columns.forEach((def) => {
          const raw = row[def.field];
          record[def.label] = def.numeric ? Number(raw || 0) : ((raw as string) ?? "-");
        });
        return record;
      });

      const totalRecord: Record<string, string | number | null> = {};
      columns.forEach((def, index) => {
        if (def.numeric) {
          totalRecord[def.label] = def.key === "value" ? sums.value : sums.quantity;
        } else {
          totalRecord[def.label] = index === 0 ? "TOTAL GERAL" : "";
        }
      });
      sheetRows.push(totalRecord);

      const worksheet = XLSX.utils.json_to_sheet(sheetRows);
      worksheet["!cols"] = columns.map((def) => ({ wch: def.numeric ? 16 : 30 }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "BI Gerencial");
      XLSX.writeFile(workbook, "bi-gerencial.xlsx");
    } catch (error) {
      console.error("Erro ao exportar Excel:", error);
      toast({ title: "Erro", description: "Não foi possível exportar o Excel.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (!applied || totalRows === 0) return;
    setExporting(true);
    try {
      const data = await fetchAllRows(applied);
      const columns = COLUMN_DEFS.filter((def) => applied.columns.includes(def.key));
      const sums = columnTotals(data);

      const doc = new jsPDF(columns.length > 5 ? "landscape" : "portrait");
      const title = "BI Gerencial";
      const startY = await addPdfHeaderWithLogo(doc, title);

      doc.setFontSize(9);
      doc.text(filterSummary(applied), 14, startY);

      const body = data.map((row) =>
        columns.map((def) => {
          const raw = row[def.field];
          if (def.key === "value") return currency(raw as number);
          if (def.key === "quantity") return quantity(raw as number);
          return (raw as string) ?? "-";
        }),
      );

      const totalRow = columns.map((def, index) => {
        if (def.key === "value") return { content: currency(sums.value), styles: { fontStyle: "bold" as const } };
        if (def.key === "quantity") return { content: quantity(sums.quantity), styles: { fontStyle: "bold" as const } };
        return { content: index === 0 ? "TOTAL GERAL" : "", styles: { fontStyle: "bold" as const } };
      });
      body.push(totalRow as unknown as string[]);

      autoTable(doc, {
        head: [columns.map((def) => def.label)],
        body,
        startY: startY + 6,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        columnStyles: columns.reduce<Record<number, { halign: "right" }>>((acc, def, index) => {
          if (def.numeric) acc[index] = { halign: "right" };
          return acc;
        }, {}),
        margin: { top: startY, left: 14, right: 14 },
        didDrawPage: (hookData) => {
          if (hookData.pageNumber > 1) renderPdfHeader(doc, title);
        },
      });

      const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i += 1) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, doc.internal.pageSize.height - 10);
        doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.width - 40, doc.internal.pageSize.height - 10);
      }
      doc.save("bi-gerencial.pdf");
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      toast({ title: "Erro", description: "Não foi possível exportar o PDF.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const showQuantity = visibleColumns.some((def) => def.key === "quantity");
  const showValue = visibleColumns.some((def) => def.key === "value");
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const hasData = rows.length > 0;

  const activeFilterCount =
    storeIds.length + supplierIds.length + groupIds.length + subgroupIds.length;
  // Linhas sem produto (frete, serviços) não têm grupo, então saem do resultado.
  const productFilterApplied = (applied?.group_ids.length ?? 0) + (applied?.subgroup_ids.length ?? 0) > 0;

  return (
    <div className="space-y-6">
        <Card>
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <CollapsibleTrigger asChild>
              {/* O gatilho é o cabeçalho inteiro (um div), então o teclado precisa
                  de ajuda: Radix só trata Enter/Espaço em <button> nativo. */}
              <CardHeader
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setFiltersOpen((open) => !open);
                  }
                }}
                className="cursor-pointer select-none hover:bg-muted/40 transition-colors rounded-t-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Search className="h-5 w-5" />
                      Filtros
                      {activeFilterCount > 0 && (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                          {activeFilterCount}
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {applied ? filterSummary(applied) : "Escolha o tipo de data, o período e as colunas de análise."}
                    </CardDescription>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
                      filtersOpen && "rotate-180",
                    )}
                  />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Tipo de data</Label>
                <Select value={dateType} onValueChange={(value) => setDateType(value as DateType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="competence_date">Data de competência</SelectItem>
                    <SelectItem value="payment_date">Data de pagamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Data inicial</Label>
                <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Data final</Label>
                <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
              <div className="space-y-2 flex flex-col justify-end">
                <div className="flex gap-2">
                  <Button onClick={handleApply} disabled={loading} className="flex-1">
                    {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                    Aplicar filtros
                  </Button>
                  <Button onClick={handleClear} variant="outline" disabled={loading}>
                    <Eraser className="h-4 w-4 mr-2" />
                    Limpar
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <MultiSelectFilter
                label="Loja"
                placeholder="Todas"
                options={storeOptions}
                selected={storeIds}
                onChange={setStoreIds}
                searchPlaceholder="Buscar loja..."
                emptyText="Nenhuma loja"
              />
              <MultiSelectFilter
                label="Fornecedor"
                placeholder="Todos"
                options={supplierOptions}
                selected={supplierIds}
                onChange={setSupplierIds}
                searchPlaceholder="Buscar fornecedor..."
                emptyText="Nenhum fornecedor"
              />
              <MultiSelectFilter
                label="Grupo"
                placeholder="Todos"
                options={groupOptions}
                selected={groupIds}
                onChange={setGroupIds}
                searchPlaceholder="Buscar grupo..."
                emptyText="Nenhum grupo"
              />
              <MultiSelectFilter
                label="Sub Grupo"
                placeholder="Todos"
                options={visibleSubgroupOptions}
                selected={subgroupIds}
                onChange={setSubgroupIds}
                searchPlaceholder="Buscar sub grupo..."
                emptyText={groupIds.length > 0 ? "Nenhum sub grupo nos grupos escolhidos" : "Nenhum sub grupo"}
              />
            </div>

            {dateType === "payment_date" && (
              <p className="text-xs text-muted-foreground">
                Na visão por data de pagamento, o valor das parcelas quitadas no período é rateado proporcionalmente
                entre os itens do lançamento.
              </p>
            )}

            <div className="space-y-3">
              <Label>Colunas de análise</Label>
              <div className="flex flex-wrap gap-4">
                {COLUMN_DEFS.map((def) => (
                  <div key={def.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`col-${def.key}`}
                      checked={selectedColumns.includes(def.key)}
                      onCheckedChange={() => toggleColumn(def.key)}
                    />
                    <label htmlFor={`col-${def.key}`} className="text-sm cursor-pointer">
                      {def.label}
                    </label>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {QUICK_VIEWS.map((view) => (
                  <Button
                    key={view.label}
                    variant="secondary"
                    size="sm"
                    onClick={() => setSelectedColumns(view.columns)}
                  >
                    {view.label}
                  </Button>
                ))}
              </div>
            </div>

          </CardContent>
            </CollapsibleContent>
          </Collapsible>

          {/* Fora do colapsável: exportar continua acessível com os filtros fechados. */}
          <CardContent className="pt-0 flex justify-end gap-2">
            <Button variant="outline" onClick={handleExportExcel} disabled={exporting || loading || !hasData}>
              {exporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 mr-2" />
              )}
              Exportar Excel
            </Button>
            <Button variant="outline" onClick={handleExportPdf} disabled={exporting || loading || !hasData}>
              {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
              Exportar PDF
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Valor total</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-primary">{currency(totals?.total_value ?? 0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Quantidade total</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{quantity(totals?.total_quantity ?? 0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Fornecedores</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totals?.supplier_count ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Produtos</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totals?.product_count ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Lojas</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totals?.store_count ?? 0}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Resultado</CardTitle>
            {applied && <CardDescription>{filterSummary(applied)}</CardDescription>}
            {productFilterApplied && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Filtro de grupo ou sub grupo ativo: lançamentos sem produto (frete, serviços, contas sem itens) não
                  possuem grupo e ficam de fora. O total abaixo não corresponde ao total do Contas a Pagar do período.
                </span>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Carregando dados...
              </div>
            ) : errorMessage ? (
              <div className="py-12 text-center text-muted-foreground">{errorMessage}</div>
            ) : !hasData ? (
              <div className="py-12 text-center text-muted-foreground">
                Nenhum dado encontrado para os filtros selecionados.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {visibleColumns.map((def) => (
                          <TableHead
                            key={def.key}
                            className={cn("h-9 px-3 text-xs", def.numeric && "text-right")}
                          >
                            <button
                              type="button"
                              onClick={() => changeSort(def.key)}
                              className="inline-flex items-center gap-1 hover:text-primary"
                            >
                              {def.label}
                              {sortColumn === def.key && <span>{sortDirection === "asc" ? "↑" : "↓"}</span>}
                            </button>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row, index) => (
                        <TableRow key={index}>
                          {visibleColumns.map((def) => (
                            <TableCell
                              key={def.key}
                              className={cn("px-3 py-1 text-sm", def.numeric && "text-right tabular-nums")}
                            >
                              {def.key === "value"
                                ? currency(row.total_value)
                                : def.key === "quantity"
                                  ? quantity(row.total_quantity)
                                  : ((row[def.field] as string) ?? "-")}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                      {(showQuantity || showValue) && (
                        <TableRow className="border-t-2 font-bold bg-muted/50">
                          {visibleColumns.map((def, index) => {
                            if (def.key === "value") {
                              return (
                                <TableCell key={def.key} className="px-3 py-1.5 text-sm text-right tabular-nums">
                                  {currency(totals?.total_value ?? 0)}
                                </TableCell>
                              );
                            }
                            if (def.key === "quantity") {
                              return (
                                <TableCell key={def.key} className="px-3 py-1.5 text-sm text-right tabular-nums">
                                  {quantity(totals?.total_quantity ?? 0)}
                                </TableCell>
                              );
                            }
                            return (
                              <TableCell key={def.key} className="px-3 py-1.5 text-sm">
                                {index === 0 ? "TOTAL GERAL" : ""}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    {totalRows} {totalRows === 1 ? "linha" : "linhas"} · página {page + 1} de {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => changePage(page - 1)}>
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page + 1 >= totalPages}
                      onClick={() => changePage(page + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
    </div>
  );
};

export default BIDetailedAnalysis;
