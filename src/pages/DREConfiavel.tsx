import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, Download, FileSpreadsheet, Filter, Loader2, Printer, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useDREPermissions } from "@/hooks/useDREPermissions";
import { useUserMatrix } from "@/hooks/useUserMatrix";
import { DREAuditDrawer } from "@/modules/dre-v2/components/DREAuditDrawer";
import { DREResultsGrid } from "@/modules/dre-v2/components/DREResultsGrid";
import { apurarDRE } from "@/modules/dre-v2/services/dreApuracaoService";
import {
  fetchAccessibleStores,
  fetchBrandStructures,
} from "@/modules/dre-v2/services/dreStructureAuditService";
import {
  exportDreCsv,
  exportDreExcel,
  exportDrePdf,
} from "@/modules/dre-v2/services/dreExportService";
import type { DREApuracaoResult, DRERegime, DREStoreOption, DREValueDisplayMode, DREViewMode } from "@/modules/dre-v2/types";
import { DRE_MONTHS, formatDateTime, formatPeriodLabel } from "@/modules/dre-v2/utils";
import { supabase } from "@/integrations/supabase/client";

export default function DREConfiavel() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canAccessView, isLoading: permissionsLoading } = useDREPermissions();
  const { matrixId } = useUserMatrix();

  const [stores, setStores] = useState<DREStoreOption[]>([]);
  const [structures, setStructures] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [loadingResult, setLoadingResult] = useState(false);
  const [result, setResult] = useState<DREApuracaoResult | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);

  const [structureId, setStructureId] = useState("");
  const [regime, setRegime] = useState<DRERegime>("competence");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [months, setMonths] = useState<number[]>([new Date().getMonth() + 1]);
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [groupByStore, setGroupByStore] = useState(false);
  const [mode, setMode] = useState<DREViewMode>("synthetic");
  const [valueDisplayMode, setValueDisplayMode] = useState<DREValueDisplayMode>("value_percent");
  const [hideZeroLines, setHideZeroLines] = useState(false);
  const [emphasizePrimary, setEmphasizePrimary] = useState(true);
  const [competenceStart, setCompetenceStart] = useState("");
  const [competenceEnd, setCompetenceEnd] = useState("");
  const [paymentStart, setPaymentStart] = useState("");
  const [paymentEnd, setPaymentEnd] = useState("");
  const [currentUserName, setCurrentUserName] = useState<string>("");

  useEffect(() => {
    async function loadBaseData() {
      setLoadingFilters(true);
      try {
        const data = await fetchAccessibleStores();
        setStores(data);
        setStoreIds(data.map((store) => store.id));
        const auth = await supabase.auth.getUser();
        const userId = auth.data.user?.id;
        if (userId) {
          const { data: profile } = await supabase.from("profiles").select("name").eq("id", userId).maybeSingle();
          setCurrentUserName(profile?.name || "");
        }

        if (matrixId) {
          const { data: matrixData, error } = await supabase
            .from("matrices")
            .select("brand_id")
            .eq("id", matrixId)
            .maybeSingle();

          if (error) {
            throw error;
          }

          const structuresData = await fetchBrandStructures(matrixData?.brand_id || null);
          setStructures(structuresData);
          if (structuresData[0]?.id) {
            setStructureId(structuresData[0].id);
          }
        }
      } catch (error: any) {
        toast({
          title: "Erro ao carregar o modulo DRE",
          description: error.message,
          variant: "destructive",
        });
      } finally {
        setLoadingFilters(false);
      }
    }

    loadBaseData();
  }, [matrixId, toast]);

  const selectedAuditEntry = selectedLineId && result ? result.auditByLineId[selectedLineId] : undefined;
  const selectedStoreNames = useMemo(
    () => stores.filter((store) => storeIds.includes(store.id)).map((store) => store.name),
    [storeIds, stores],
  );

  async function handleRun() {
    if (!structureId) {
      toast({
        title: "Estrutura obrigatoria",
        description: "Selecione uma estrutura de DRE para continuar.",
        variant: "destructive",
      });
      return;
    }

    setLoadingResult(true);
    try {
      const resolvedStoreIds = storeIds.length > 0 ? storeIds : stores.map((store) => store.id);
      const apuracao = await apurarDRE({
        structureId,
        regime,
        year: Number(year),
        months,
        storeIds: resolvedStoreIds,
        groupByStore,
        competenceStart: competenceStart || undefined,
        competenceEnd: competenceEnd || undefined,
        paymentStart: paymentStart || undefined,
        paymentEnd: paymentEnd || undefined,
      });
      setResult(apuracao);
      if (storeIds.length === 0) {
        setStoreIds(resolvedStoreIds);
      }
    } catch (error: any) {
      toast({
        title: "Erro ao apurar o DRE",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingResult(false);
    }
  }

  function toggleMonth(month: number, checked: boolean) {
    setMonths((current) =>
      checked ? [...new Set([...current, month])].sort((left, right) => left - right) : current.filter((value) => value !== month),
    );
  }

  function toggleStore(storeId: string, checked: boolean) {
    setStoreIds((current) => (checked ? [...new Set([...current, storeId])] : current.filter((value) => value !== storeId)));
  }

  function clearFilters() {
    setMonths([new Date().getMonth() + 1]);
    setStoreIds(stores.map((store) => store.id));
    setGroupByStore(false);
    setRegime("competence");
    setValueDisplayMode("value_percent");
    setHideZeroLines(false);
    setEmphasizePrimary(true);
    setCompetenceStart("");
    setCompetenceEnd("");
    setPaymentStart("");
    setPaymentEnd("");
  }

  async function handleExportPdf() {
    if (!result) return;
    await exportDrePdf(result, mode, {
      systemName: "BOARD Franquias",
      reportTitle: "DRE – Demonstrativo de Resultados",
      generatedAt: new Date(),
      generatedBy: currentUserName || null,
      selectedStoreNames,
      showLogo: true,
      groupModeLabel: groupByStore ? "Agrupado por loja" : "Consolidado",
      valueDisplayMode,
      hideZeroLines,
    });
  }

  function handlePrint() {
    window.print();
  }

  if (permissionsLoading || loadingFilters) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!canAccessView) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="p-6">
          <p className="text-muted-foreground">Você não tem permissão para acessar este módulo.</p>
          <Button onClick={() => navigate("/dashboard")} className="mt-4">
            Voltar ao Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f7f7f2_0%,#ffffff_35%,#f6f9fc_100%)]">
      <header className="border-b bg-white/90 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-4">
            <Button onClick={() => navigate("/dre")} variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">DRE Auditável</h1>
              <p className="text-sm text-muted-foreground">
                Novo módulo isolado com apuração rastreável, validações e conferência por linha.
              </p>
            </div>
          </div>

          {result ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Imprimir
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    Exportar
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Relatório atual</DropdownMenuLabel>
                  <DropdownMenuItem onClick={handleExportPdf}>PDF executivo</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportDreExcel(result, mode, valueDisplayMode !== "value")}>
                    Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportDreCsv(result, mode, valueDisplayMode !== "value")}>
                    CSV
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setMode("synthetic")}>Modo sintético</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setMode("analytic")}>Modo analítico</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </div>
      </header>

      <main className="container mx-auto space-y-6 px-4 py-8">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
            <CardDescription>
              O novo módulo usa apuração consolidada e busca paginada para garantir leitura completa dos registros elegíveis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Estrutura DRE</Label>
                <Select value={structureId} onValueChange={setStructureId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a estrutura" />
                  </SelectTrigger>
                  <SelectContent>
                    {structures.map((structure) => (
                      <SelectItem key={structure.id} value={structure.id}>
                        {structure.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Regime</Label>
                <Select value={regime} onValueChange={(value: DRERegime) => setRegime(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="competence">Competência</SelectItem>
                    <SelectItem value="cash">Caixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Ano</Label>
                <Input value={year} onChange={(event) => setYear(event.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Modo</Label>
                <Tabs value={mode} onValueChange={(value) => setMode(value as DREViewMode)}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="synthetic">Sintético</TabsTrigger>
                    <TabsTrigger value="analytic">Analítico</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <Label>Meses</Label>
                <div className="grid grid-cols-3 gap-3 md:grid-cols-4">
                  {DRE_MONTHS.map((month) => (
                    <label key={month.value} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                      <Checkbox
                        checked={months.includes(month.value)}
                        onCheckedChange={(checked) => toggleMonth(month.value, checked === true)}
                      />
                      {month.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label>Lojas</Label>
                <div className="max-h-48 space-y-2 overflow-auto rounded-lg border p-3">
                  {stores.map((store) => (
                    <label key={store.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={storeIds.includes(store.id)}
                        onCheckedChange={(checked) => toggleStore(store.id, checked === true)}
                      />
                      {store.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Competência inicial</Label>
                <Input type="date" value={competenceStart} onChange={(event) => setCompetenceStart(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Competência final</Label>
                <Input type="date" value={competenceEnd} onChange={(event) => setCompetenceEnd(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Pagamento inicial</Label>
                <Input type="date" value={paymentStart} onChange={(event) => setPaymentStart(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Pagamento final</Label>
                <Input type="date" value={paymentEnd} onChange={(event) => setPaymentEnd(event.target.value)} />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-slate-50 p-4">
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={groupByStore} onCheckedChange={setGroupByStore} />
                  Agrupar por loja
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={hideZeroLines} onCheckedChange={setHideZeroLines} />
                  Ocultar linhas zeradas
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={emphasizePrimary} onCheckedChange={setEmphasizePrimary} />
                  Destacar linhas principais
                </label>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={clearFilters}>
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Limpar
                </Button>
                <Button onClick={handleRun} disabled={loadingResult}>
                  <Filter className="mr-2 h-4 w-4" />
                  {loadingResult ? "Apurando..." : "Visualizar"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {result ? (
          <div className="grid gap-6">
            <Card className="border-slate-200 bg-white/95 shadow-sm">
              <CardHeader className="border-b bg-slate-50/70">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">BOARD Franquias</div>
                    <CardTitle className="text-2xl text-slate-900">DRE – Demonstrativo de Resultados</CardTitle>
                    <CardDescription className="text-sm">
                      {result.filters.regime === "cash" ? "Regime de Caixa" : "Regime de Competência"}
                    </CardDescription>
                  </div>
                  <div className="grid gap-2 text-sm text-slate-600 md:grid-cols-2 xl:min-w-[520px]">
                    <div><span className="font-semibold text-slate-800">Estrutura:</span> {result.structure.name}</div>
                    <div><span className="font-semibold text-slate-800">Período:</span> {formatPeriodLabel(result.filters.year, result.filters.months)}</div>
                    <div><span className="font-semibold text-slate-800">Lojas:</span> {selectedStoreNames.join(", ") || "Todas"}</div>
                    <div><span className="font-semibold text-slate-800">Agrupamento:</span> {groupByStore ? "Agrupado por loja" : "Consolidado"}</div>
                    <div><span className="font-semibold text-slate-800">Exibição:</span> {valueDisplayMode === "value" ? "Apenas valor" : valueDisplayMode === "percent" ? "Apenas %" : "Valor e %"}</div>
                    <div><span className="font-semibold text-slate-800">Gerado em:</span> {formatDateTime(new Date())}</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="border-b bg-white">
                <div className="flex flex-wrap items-center gap-3 py-4">
                  <div className="text-sm font-medium text-slate-700">Visualização:</div>
                  <Tabs value={mode} onValueChange={(value) => setMode(value as DREViewMode)}>
                    <TabsList className="grid w-[240px] grid-cols-2">
                      <TabsTrigger value="synthetic">Sintético</TabsTrigger>
                      <TabsTrigger value="analytic">Analítico</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <div className="ml-auto min-w-[220px]">
                    <Select value={valueDisplayMode} onValueChange={(value: DREValueDisplayMode) => setValueDisplayMode(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="value_percent">Valor e %</SelectItem>
                        <SelectItem value="value">Apenas valor</SelectItem>
                        <SelectItem value="percent">Apenas %</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
            <DREResultsGrid
              result={result}
              mode={mode}
              valueDisplayMode={valueDisplayMode}
              hideZeroLines={hideZeroLines}
              emphasizePrimary={emphasizePrimary}
              onInspectLine={setSelectedLineId}
            />
          </div>
        ) : (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              Execute a apuração para visualizar a grade do novo DRE.
            </CardContent>
          </Card>
        )}
      </main>

      <DREAuditDrawer open={!!selectedAuditEntry} onOpenChange={(open) => !open && setSelectedLineId(null)} entry={selectedAuditEntry} />
    </div>
  );
}
