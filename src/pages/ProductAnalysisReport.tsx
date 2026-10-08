import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ChevronsUpDown, Eraser, Eye, FileSpreadsheet, FileText, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserMatrix } from "@/hooks/useUserMatrix";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { addPdfHeaderWithLogo, renderPdfHeader } from "@/utils/pdfHeader";
import * as XLSX from "xlsx";

type StoreOption = { id: string; name: string };
type GroupOption = { id: string; name: string };

type ProductAnalysisRow = {
  product_id: string;
  product_name: string;
  product_code: string | null;
  group_name: string | null;
  subgroup_name: string | null;
  min_unit_price: number;
  max_unit_price: number;
  difference_amount: number;
  variation_percent: number;
  launch_count: number;
  store_names: string | null;
};

type ProductAnalysisDetail = {
  item_id: string;
  launch_date: string;
  store_name: string;
  supplier_name: string | null;
  document_number: string | null;
  description: string | null;
  quantity: number;
  unit_symbol: string | null;
  unit_price: number;
  total_price: number;
  product_name: string;
  product_code: string | null;
  group_name: string | null;
  subgroup_name: string | null;
};

type SortKey = "product_name" | "min_unit_price" | "max_unit_price" | "variation_percent" | "launch_count";
type SortDirection = "asc" | "desc";
type DetailSortKey = "launch_date" | "unit_price";
type RpcResponse<T> = Promise<{ data: T[] | null; error: Error | null }>;
type RpcClient = {
  rpc: <T>(functionName: string, args: Record<string, unknown>) => RpcResponse<T>;
};
type AutoTableHookData = {
  section: string;
  column: { index: number };
  row: { index: number };
  cell: { styles: Record<string, unknown> };
  pageNumber: number;
};

const emptyFilters = {
  store_ids: [] as string[],
  start_date: "",
  end_date: "",
  variation_limit: "10",
  group_id: "all",
  subgroup_id: "all",
};

const currency = (value: number | null | undefined) =>
  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const percent = (value: number | null | undefined) =>
  `${Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

const datePtBr = (date: string | null | undefined) => {
  if (!date) return "N/A";
  return new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR");
};

const rpcClient = supabase as unknown as RpcClient;

const ProductAnalysisReport = () => {
  const navigate = useNavigate();
  const { matrixId } = useUserMatrix();

  const [filters, setFilters] = useState(emptyFilters);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [subgroups, setSubgroups] = useState<GroupOption[]>([]);
  const [rows, setRows] = useState<ProductAnalysisRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("variation_percent");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const [selectedProduct, setSelectedProduct] = useState<ProductAnalysisRow | null>(null);
  const [details, setDetails] = useState<ProductAnalysisDetail[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailSortKey, setDetailSortKey] = useState<DetailSortKey>("launch_date");
  const [detailSortDirection, setDetailSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    fetchStores();
  }, []);

  useEffect(() => {
    if (matrixId) fetchGroups();
    // fetchGroups depends only on the current matrix id in this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrixId]);

  useEffect(() => {
    if (stores.length === 1) {
      setFilters((current) => ({ ...current, store_ids: [stores[0].id] }));
    }
  }, [stores]);

  useEffect(() => {
    if (filters.group_id !== "all") {
      fetchSubgroups(filters.group_id);
    } else {
      setSubgroups([]);
      setFilters((current) => ({ ...current, subgroup_id: "all" }));
    }
  }, [filters.group_id]);

  const selectedStoreNames = useMemo(() => {
    const names = stores.filter((store) => filters.store_ids.includes(store.id)).map((store) => store.name);
    return names.length > 0 ? names.join(", ") : "Selecionar loja(s)";
  }, [filters.store_ids, stores]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      const result = typeof left === "string"
        ? left.localeCompare(String(right || ""), "pt-BR")
        : Number(left || 0) - Number(right || 0);
      return sortDirection === "asc" ? result : -result;
    });
  }, [rows, sortDirection, sortKey]);

  const sortedDetails = useMemo(() => {
    return [...details].sort((a, b) => {
      const result = detailSortKey === "launch_date"
        ? a.launch_date.localeCompare(b.launch_date)
        : Number(a.unit_price || 0) - Number(b.unit_price || 0);
      return detailSortDirection === "asc" ? result : -result;
    });
  }, [details, detailSortDirection, detailSortKey]);

  const fetchStores = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, store_id")
        .eq("id", user.id)
        .single();

      const storeIds: string[] = [];
      if (profile?.store_id) storeIds.push(profile.store_id);

      const { data: userStores, error: userStoresError } = await supabase
        .from("user_stores")
        .select("store_id")
        .eq("user_id", user.id);
      if (userStoresError) throw userStoresError;

      userStores?.forEach((store) => {
        if (!storeIds.includes(store.store_id)) storeIds.push(store.store_id);
      });

      if (storeIds.length === 0) {
        setStores([]);
        return;
      }

      const { data, error } = await supabase.from("stores").select("id, name").in("id", storeIds).order("name");
      if (error) throw error;
      setStores(data || []);
    } catch (error) {
      console.error("Erro ao carregar lojas:", error);
      toast({ title: "Erro", description: "Nao foi possivel carregar as lojas permitidas.", variant: "destructive" });
    }
  };

  const fetchGroups = async () => {
    try {
      const { data: matrixData } = await supabase.from("matrices").select("brand_id").eq("id", matrixId).single();
      if (!matrixData?.brand_id) {
        setGroups([]);
        return;
      }

      const { data, error } = await supabase
        .from("account_groups")
        .select("id, name")
        .is("parent_id", null)
        .eq("brand_id", matrixData.brand_id)
        .order("name");
      if (error) throw error;
      setGroups(data || []);
    } catch (error) {
      console.error("Erro ao carregar grupos:", error);
      setGroups([]);
    }
  };

  const fetchSubgroups = async (groupId: string) => {
    try {
      const { data, error } = await supabase
        .from("account_groups")
        .select("id, name")
        .eq("parent_id", groupId)
        .order("name");
      if (error) throw error;
      setSubgroups(data || []);
    } catch (error) {
      console.error("Erro ao carregar subgrupos:", error);
      setSubgroups([]);
    }
  };

  const validateFilters = () => {
    if (filters.store_ids.length === 0) {
      toast({ title: "Loja obrigatoria", description: "Selecione ao menos uma loja para gerar o relatorio.", variant: "destructive" });
      return false;
    }
    if (!filters.start_date || !filters.end_date) {
      toast({ title: "Periodo obrigatorio", description: "Informe data inicial e data final.", variant: "destructive" });
      return false;
    }
    if (filters.end_date < filters.start_date) {
      toast({ title: "Periodo invalido", description: "A data final nao pode ser menor que a data inicial.", variant: "destructive" });
      return false;
    }
    if (filters.variation_limit === "" || Number(filters.variation_limit) < 0) {
      toast({ title: "Variacao obrigatoria", description: "Informe uma variacao maxima permitida valida.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const buildRpcParams = () => ({
    p_store_ids: filters.store_ids,
    p_start_date: filters.start_date,
    p_end_date: filters.end_date,
    p_variation_limit: Number(filters.variation_limit),
    p_group_id: filters.group_id === "all" ? null : filters.group_id,
    p_subgroup_id: filters.subgroup_id === "all" ? null : filters.subgroup_id,
  });

  const normalizeReportRows = (data: ProductAnalysisRow[] | null) =>
    (data || []).map((row) => ({
      ...row,
      min_unit_price: Number(row.min_unit_price || 0),
      max_unit_price: Number(row.max_unit_price || 0),
      difference_amount: Number(row.difference_amount || 0),
      variation_percent: Number(row.variation_percent || 0),
      launch_count: Number(row.launch_count || 0),
    }));

  const normalizeDetailRows = (data: ProductAnalysisDetail[] | null) =>
    (data || []).map((item) => ({
      ...item,
      quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0),
      total_price: Number(item.total_price || 0),
    }));

  const handleGenerate = async () => {
    if (!validateFilters()) return;

    setLoading(true);
    try {
      const { data, error } = await rpcClient.rpc<ProductAnalysisRow>("get_product_analysis_report", buildRpcParams());
      if (error) throw error;

      setRows(normalizeReportRows(data));
      setReportGenerated(true);
    } catch (error) {
      console.error("Erro ao gerar analise de produto:", error);
      toast({
        title: "Erro",
        description: "Nao foi possivel gerar o relatorio. Verifique os filtros e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setFilters({ ...emptyFilters, store_ids: stores.length === 1 ? [stores[0].id] : [] });
    setRows([]);
    setDetails([]);
    setSelectedProduct(null);
    setReportGenerated(false);
  };

  const toggleStore = (storeId: string) => {
    setFilters((current) => ({
      ...current,
      store_ids: current.store_ids.includes(storeId)
        ? current.store_ids.filter((id) => id !== storeId)
        : [...current.store_ids, storeId],
    }));
  };

  const changeSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection(key === "product_name" ? "asc" : "desc");
    }
  };

  const changeDetailSort = (key: DetailSortKey) => {
    if (detailSortKey === key) {
      setDetailSortDirection((current) => current === "asc" ? "desc" : "asc");
    } else {
      setDetailSortKey(key);
      setDetailSortDirection("asc");
    }
  };

  const fetchDetails = async (product: ProductAnalysisRow) => {
    setSelectedProduct(product);
    setDetails([]);
    setDetailsLoading(true);
    try {
      const { data, error } = await rpcClient.rpc<ProductAnalysisDetail>("get_product_analysis_details", {
        p_product_id: product.product_id,
        p_store_ids: filters.store_ids,
        p_start_date: filters.start_date,
        p_end_date: filters.end_date,
        p_group_id: filters.group_id === "all" ? null : filters.group_id,
        p_subgroup_id: filters.subgroup_id === "all" ? null : filters.subgroup_id,
      });
      if (error) throw error;
      setDetails(normalizeDetailRows(data));
    } catch (error) {
      console.error("Erro ao carregar detalhes:", error);
      toast({ title: "Erro", description: "Nao foi possivel carregar os lancamentos do produto.", variant: "destructive" });
    } finally {
      setDetailsLoading(false);
    }
  };

  const getFilterInfo = () => {
    const group = groups.find((item) => item.id === filters.group_id);
    const subgroup = subgroups.find((item) => item.id === filters.subgroup_id);
    return [
      `Loja(s): ${selectedStoreNames}`,
      `Data inicial: ${datePtBr(filters.start_date)}`,
      `Data final: ${datePtBr(filters.end_date)}`,
      `Variacao maxima permitida: ${percent(Number(filters.variation_limit || 0))}`,
      `Grupo: ${group?.name || "Todos"}`,
      `Subgrupo: ${subgroup?.name || "Todos"}`,
    ];
  };

  const exportToPDF = async () => {
    if (!reportGenerated && !validateFilters()) return;
    const exportRows = rows.length > 0 ? sortedRows : [];

    setExporting("pdf");
    try {
      const doc = new jsPDF("landscape");
      const startY = await addPdfHeaderWithLogo(doc, "Relatorio de Analise de Produto");
      let currentY = startY;

      doc.setFontSize(9);
      doc.text(`Data de emissao: ${new Date().toLocaleString("pt-BR")}`, 14, currentY);
      currentY += 6;
      getFilterInfo().forEach((info) => {
        doc.text(info, 14, currentY);
        currentY += 5;
      });

      autoTable(doc, {
        head: [["Produto", "Grupo", "Subgrupo", "Menor valor", "Maior valor", "Diferenca", "Variacao %", "Lancamentos"]],
        body: exportRows.map((row) => [
          row.product_name,
          row.group_name || "N/A",
          row.subgroup_name || "N/A",
          currency(row.min_unit_price),
          currency(row.max_unit_price),
          currency(row.difference_amount),
          percent(row.variation_percent),
          row.launch_count,
        ]),
        startY: currentY + 2,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        didParseCell: (data: any) => {
          if (data.section === "body" && data.column.index === 6) {
            const variation = exportRows[data.row.index]?.variation_percent || 0;
            if (variation >= Number(filters.variation_limit) * 2) {
              data.cell.styles.textColor = [185, 28, 28];
              data.cell.styles.fontStyle = "bold";
            }
          }
        },
        margin: { top: startY, left: 10, right: 10 },
        didDrawPage: (data: any) => {
          if (data.pageNumber > 1) renderPdfHeader(doc, "Relatorio de Analise de Produto");
        },
      });

      const pageCount = doc.getNumberOfPages();
      for (let page = 1; page <= pageCount; page++) {
        doc.setPage(page);
        doc.setFontSize(8);
        doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 10, doc.internal.pageSize.height - 10);
        doc.text(`Pagina ${page} de ${pageCount}`, doc.internal.pageSize.width - 35, doc.internal.pageSize.height - 10);
      }

      doc.save("analise-produto.pdf");
    } catch (error) {
      console.error("Erro ao exportar PDF:", error);
      toast({ title: "Erro", description: "Nao foi possivel exportar o PDF.", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const fetchDetailsForExport = async () => {
    const { data, error } = await rpcClient.rpc<ProductAnalysisDetail>("get_product_analysis_export_details", {
      p_product_ids: sortedRows.map((row) => row.product_id),
      p_store_ids: filters.store_ids,
      p_start_date: filters.start_date,
      p_end_date: filters.end_date,
      p_group_id: filters.group_id === "all" ? null : filters.group_id,
      p_subgroup_id: filters.subgroup_id === "all" ? null : filters.subgroup_id,
    });
    if (error) throw error;
    return normalizeDetailRows(data);
  };

  const exportToExcel = async () => {
    if (!reportGenerated && !validateFilters()) return;

    setExporting("excel");
    try {
      const detailRows = await fetchDetailsForExport();
      const wb = XLSX.utils.book_new();

      const resumo = sortedRows.map((row) => ({
        Produto: row.product_name,
        Codigo: row.product_code || "",
        Grupo: row.group_name || "",
        Subgrupo: row.subgroup_name || "",
        "Menor valor": row.min_unit_price,
        "Maior valor": row.max_unit_price,
        "Diferenca em R$": row.difference_amount,
        "Variacao %": row.variation_percent,
        "Quantidade de lancamentos": row.launch_count,
        "Loja(s)": row.store_names || "",
      }));

      const detalhamento = detailRows.map((item) => ({
        Produto: item.product_name,
        "Data do lancamento": datePtBr(item.launch_date),
        Loja: item.store_name,
        Fornecedor: item.supplier_name || "",
        "Numero do documento": item.document_number || "",
        Descricao: item.description || "",
        Quantidade: item.quantity,
        Unidade: item.unit_symbol || "",
        "Valor unitario": item.unit_price,
        "Valor total": item.total_price,
      }));

      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalhamento), "Detalhamento");
      XLSX.writeFile(wb, "analise-produto.xlsx");
    } catch (error) {
      console.error("Erro ao exportar Excel:", error);
      toast({ title: "Erro", description: "Nao foi possivel exportar o Excel.", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  const SortButton = ({ label, column }: { label: string; column: SortKey }) => (
    <button className="font-medium hover:text-primary" onClick={() => changeSort(column)} type="button">
      {label}{sortKey === column ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );

  const DetailSortButton = ({ label, column }: { label: string; column: DetailSortKey }) => (
    <button className="font-medium hover:text-primary" onClick={() => changeDetailSort(column)} type="button">
      {label}{detailSortKey === column ? (detailSortDirection === "asc" ? " ↑" : " ↓") : ""}
    </button>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button onClick={() => navigate("/reports")} variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-primary">Analise de Produto</h1>
            <p className="text-sm text-muted-foreground">Identifique variacoes relevantes de preco nos itens do Contas a Pagar</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Filtros do relatorio
            </CardTitle>
            <CardDescription>Selecione lojas permitidas, periodo e limite de variacao para gerar a analise.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2 lg:col-span-2">
                <Label>Loja *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span className="truncate">{selectedStoreNames}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
                    <div className="max-h-72 overflow-y-auto space-y-1">
                      {stores.length === 0 && <p className="p-2 text-sm text-muted-foreground">Nenhuma loja vinculada.</p>}
                      {stores.map((store) => (
                        <button
                          key={store.id}
                          type="button"
                          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                          onClick={() => toggleStore(store.id)}
                        >
                          <Checkbox checked={filters.store_ids.includes(store.id)} />
                          <span>{store.name}</span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Data inicial *</Label>
                <Input type="date" value={filters.start_date} onChange={(event) => setFilters({ ...filters, start_date: event.target.value })} />
              </div>

              <div className="space-y-2">
                <Label>Data final *</Label>
                <Input type="date" value={filters.end_date} onChange={(event) => setFilters({ ...filters, end_date: event.target.value })} />
              </div>

              <div className="space-y-2">
                <Label>Variacao maxima permitida (%) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={filters.variation_limit}
                  onChange={(event) => setFilters({ ...filters, variation_limit: event.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Grupo</Label>
                <Select value={filters.group_id} onValueChange={(value) => setFilters({ ...filters, group_id: value, subgroup_id: "all" })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os grupos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os grupos</SelectItem>
                    {groups.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Subgrupo</Label>
                <Select
                  value={filters.subgroup_id}
                  disabled={filters.group_id === "all"}
                  onValueChange={(value) => setFilters({ ...filters, subgroup_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos os subgrupos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os subgrupos</SelectItem>
                    {subgroups.map((subgroup) => <SelectItem key={subgroup.id} value={subgroup.id}>{subgroup.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 justify-end">
              <Button variant="outline" onClick={clearFilters}>
                <Eraser className="h-4 w-4 mr-2" />
                Limpar filtros
              </Button>
              <Button onClick={handleGenerate} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
                Gerar relatorio
              </Button>
              <Button variant="outline" onClick={exportToPDF} disabled={!reportGenerated || exporting !== null}>
                {exporting === "pdf" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                Exportar PDF
              </Button>
              <Button variant="outline" onClick={exportToExcel} disabled={!reportGenerated || exporting !== null}>
                {exporting === "excel" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
                Exportar Excel
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Produtos com variacao</CardTitle>
            <CardDescription>
              {reportGenerated ? `${rows.length} produto(s) acima do limite informado` : "Selecione os filtros para gerar a analise de produto."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Gerando relatorio...
              </div>
            ) : !reportGenerated ? (
              <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
                Selecione os filtros para gerar a analise de produto.
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground">
                Nenhum produto apresentou variacao acima do limite informado para o periodo selecionado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead><SortButton label="Produto" column="product_name" /></TableHead>
                      <TableHead>Codigo</TableHead>
                      <TableHead>Grupo</TableHead>
                      <TableHead>Subgrupo</TableHead>
                      <TableHead className="text-right"><SortButton label="Menor valor" column="min_unit_price" /></TableHead>
                      <TableHead className="text-right"><SortButton label="Maior valor" column="max_unit_price" /></TableHead>
                      <TableHead className="text-right">Diferenca em R$</TableHead>
                      <TableHead className="text-right"><SortButton label="Variacao %" column="variation_percent" /></TableHead>
                      <TableHead className="text-right"><SortButton label="Lancamentos" column="launch_count" /></TableHead>
                      <TableHead>Loja(s)</TableHead>
                      <TableHead className="text-right">Acoes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRows.map((row) => (
                      <TableRow key={row.product_id}>
                        <TableCell>
                          <button type="button" className="font-medium text-primary hover:underline" onClick={() => fetchDetails(row)}>
                            {row.product_name}
                          </button>
                        </TableCell>
                        <TableCell>{row.product_code || "N/A"}</TableCell>
                        <TableCell>{row.group_name || "N/A"}</TableCell>
                        <TableCell>{row.subgroup_name || "N/A"}</TableCell>
                        <TableCell className="text-right">{currency(row.min_unit_price)}</TableCell>
                        <TableCell className="text-right">{currency(row.max_unit_price)}</TableCell>
                        <TableCell className="text-right">{currency(row.difference_amount)}</TableCell>
                        <TableCell className="text-right">
                          <Badge className={cn(row.variation_percent >= Number(filters.variation_limit) * 2 ? "bg-red-600 hover:bg-red-600" : "bg-orange-500 hover:bg-orange-500")}>
                            {percent(row.variation_percent)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{row.launch_count}</TableCell>
                        <TableCell className="min-w-48">{row.store_names || "N/A"}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => fetchDetails(row)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver lancamentos
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedProduct?.product_name || "Lancamentos do produto"}</DialogTitle>
            <DialogDescription>
              Periodo analisado: {datePtBr(filters.start_date)} a {datePtBr(filters.end_date)}
            </DialogDescription>
          </DialogHeader>

          {selectedProduct && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Grupo</p>
                <p className="font-medium">{selectedProduct.group_name || "N/A"}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Subgrupo</p>
                <p className="font-medium">{selectedProduct.subgroup_name || "N/A"}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Menor / maior valor</p>
                <p className="font-medium">{currency(selectedProduct.min_unit_price)} / {currency(selectedProduct.max_unit_price)}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Variacao percentual</p>
                <p className="font-medium text-orange-600">{percent(selectedProduct.variation_percent)}</p>
              </div>
            </div>
          )}

          {detailsLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Carregando lancamentos...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead><DetailSortButton label="Data" column="launch_date" /></TableHead>
                    <TableHead>Loja</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Documento</TableHead>
                    <TableHead>Descricao</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead className="text-right"><DetailSortButton label="Valor unitario" column="unit_price" /></TableHead>
                    <TableHead className="text-right">Valor total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedDetails.map((item) => (
                    <TableRow key={item.item_id}>
                      <TableCell>{datePtBr(item.launch_date)}</TableCell>
                      <TableCell>{item.store_name}</TableCell>
                      <TableCell>{item.supplier_name || "N/A"}</TableCell>
                      <TableCell>{item.document_number || "N/A"}</TableCell>
                      <TableCell className="min-w-56">{item.description || "N/A"}</TableCell>
                      <TableCell className="text-right">{item.quantity.toLocaleString("pt-BR")}</TableCell>
                      <TableCell>{item.unit_symbol || "N/A"}</TableCell>
                      <TableCell className="text-right">{currency(item.unit_price)}</TableCell>
                      <TableCell className="text-right">{currency(item.total_price)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductAnalysisReport;
