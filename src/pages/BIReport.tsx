import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MultiSelectFilter } from "@/components/page/MultiSelectFilter";
import BIDetailedAnalysis from "@/modules/bi/BIDetailedAnalysis";
import { addDays, monthEnd, monthKey, monthStart, toISODate } from "@/modules/bi/biCalculations";
import { fetchBiStores } from "@/modules/bi/biDataService";
import { dateBr } from "@/modules/bi/biFormat";
import { BiThemeStyle, ErrorBlock, type BiFilters } from "@/modules/bi/components/BiParts";
import AccountsTab from "@/modules/bi/tabs/AccountsTab";
import ExpensesTab from "@/modules/bi/tabs/ExpensesTab";
import RevenueTab from "@/modules/bi/tabs/RevenueTab";

const TABS = [
  { id: "faturamento", label: "Faturamento e metas" },
  { id: "resultado", label: "Despesas e resultado" },
  { id: "contas", label: "Contas a pagar e receber" },
  { id: "detalhada", label: "Análise detalhada" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface Period {
  start: string;
  end: string;
}

const buildPresets = (today: string): { label: string; period: Period }[] => {
  const thisMonth = monthKey(today);
  const lastMonth = monthKey(addDays(monthStart(thisMonth), -1));
  const year = today.slice(0, 4);
  return [
    { label: "Este mês", period: { start: monthStart(thisMonth), end: monthEnd(thisMonth) } },
    { label: "Mês passado", period: { start: monthStart(lastMonth), end: monthEnd(lastMonth) } },
    { label: "Últimos 30 dias", period: { start: addDays(today, -29), end: today } },
    { label: "Últimos 90 dias", period: { start: addDays(today, -89), end: today } },
    { label: "Este ano", period: { start: `${year}-01-01`, end: `${year}-12-31` } },
  ];
};

const BIReport = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = useMemo(() => toISODate(new Date()), []);
  const presets = useMemo(() => buildPresets(today), [today]);

  const requestedTab = searchParams.get("aba");
  const activeTab: TabId = TABS.some((t) => t.id === requestedTab) ? (requestedTab as TabId) : "faturamento";

  // "draft" e o que esta nos campos; "applied" e o que as abas consultam.
  const [draft, setDraft] = useState<Period>(presets[0].period);
  const [draftStores, setDraftStores] = useState<string[]>([]);
  const [applied, setApplied] = useState<{ period: Period; stores: string[] }>({
    period: presets[0].period,
    stores: [],
  });

  const storesQuery = useQuery({ queryKey: ["bi", "stores"], queryFn: fetchBiStores });
  const stores = useMemo(() => storesQuery.data ?? [], [storesQuery.data]);

  const filters: BiFilters = useMemo(() => {
    const allowed = new Set(stores.map((s) => s.id));
    const selected = applied.stores.filter((id) => allowed.has(id));
    return {
      start: applied.period.start,
      end: applied.period.end,
      selectedStoreIds: selected,
      storeIds: selected.length > 0 ? selected : stores.map((s) => s.id),
      stores,
    };
  }, [applied, stores]);

  const draftValid = Boolean(draft.start && draft.end && draft.start <= draft.end);
  const dirty =
    draft.start !== applied.period.start ||
    draft.end !== applied.period.end ||
    draftStores.length !== applied.stores.length ||
    draftStores.some((id) => !applied.stores.includes(id));

  const apply = () => {
    if (draftValid) setApplied({ period: draft, stores: draftStores });
  };

  const applyPreset = (period: Period) => {
    setDraft(period);
    setApplied({ period, stores: draftStores });
  };

  const isDetail = activeTab === "detalhada";

  return (
    <div className="bi-root min-h-screen bg-background">
      <BiThemeStyle />
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center gap-4 px-4 py-4">
          <Button onClick={() => navigate("/reports")} variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-primary">BI Gerencial</h1>
            <p className="text-sm text-muted-foreground">
              Faturamento, metas, despesas, resultado e contas em aberto das suas lojas, direto dos lançamentos do
              sistema.
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto space-y-6 px-4 py-8">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setSearchParams(value === "faturamento" ? {} : { aba: value }, { replace: true })}
          className="space-y-6"
        >
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* A analise detalhada tem filtros proprios (fornecedor, grupo, colunas). */}
          {!isDetail && (
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="flex flex-wrap gap-2">
                  {presets.map((preset) => {
                    const active =
                      preset.period.start === applied.period.start && preset.period.end === applied.period.end;
                    return (
                      <Button
                        key={preset.label}
                        size="sm"
                        variant={active ? "default" : "outline"}
                        aria-pressed={active}
                        onClick={() => applyPreset(preset.period)}
                      >
                        {preset.label}
                      </Button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="bi-start">Data inicial</Label>
                    <Input
                      id="bi-start"
                      type="date"
                      value={draft.start}
                      max={draft.end || undefined}
                      onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bi-end">Data final</Label>
                    <Input
                      id="bi-end"
                      type="date"
                      value={draft.end}
                      min={draft.start || undefined}
                      onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
                    />
                  </div>
                  <MultiSelectFilter
                    label="Lojas"
                    placeholder="Todas as lojas"
                    options={stores.map((s) => ({ value: s.id, label: s.name }))}
                    selected={draftStores}
                    onChange={setDraftStores}
                    searchPlaceholder="Buscar loja..."
                    disabled={storesQuery.isLoading}
                  />
                  <Button onClick={apply} disabled={!draftValid || !dirty}>
                    Aplicar filtros
                  </Button>
                </div>
                {!draftValid && (
                  <p className="text-xs text-destructive">A data final precisa ser igual ou posterior à inicial.</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Exibindo {dateBr(applied.period.start)} a {dateBr(applied.period.end)} ·{" "}
                  {filters.selectedStoreIds.length === 0
                    ? `todas as lojas (${stores.length})`
                    : `${filters.selectedStoreIds.length} de ${stores.length} lojas`}
                </p>
              </CardContent>
            </Card>
          )}

          {!isDetail && storesQuery.isLoading && (
            <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground" role="status">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              Carregando lojas...
            </div>
          )}
          {!isDetail && storesQuery.isError && <ErrorBlock onRetry={() => void storesQuery.refetch()} />}
          {!isDetail && storesQuery.isSuccess && stores.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Seu usuário não está vinculado a nenhuma loja. Peça a um administrador para liberar o acesso.
              </CardContent>
            </Card>
          )}

          {storesQuery.isSuccess && stores.length > 0 && (
            <>
              <TabsContent value="faturamento" className="mt-0">
                <RevenueTab filters={filters} />
              </TabsContent>
              <TabsContent value="resultado" className="mt-0">
                <ExpensesTab filters={filters} />
              </TabsContent>
              <TabsContent value="contas" className="mt-0">
                <AccountsTab filters={filters} />
              </TabsContent>
            </>
          )}
          <TabsContent value="detalhada" className="mt-0">
            <BIDetailedAnalysis />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default BIReport;
