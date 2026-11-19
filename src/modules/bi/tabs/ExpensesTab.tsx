import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { Info } from "lucide-react";
import { ChartContainer } from "@/components/ui/chart";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  lastMonthKeys,
  monthEnd,
  monthStart,
  percentChange,
  comparisonPeriod,
  toISODate,
  revenueByMonth,
  storeResults,
  summarizeRevenue,
  topWithOthers,
  type NamedValue,
} from "../biCalculations";
import {
  fetchCashRows,
  fetchExpenseTotal,
  fetchExpensesBy,
  fetchMonthlyExpenses,
  type ExpenseDateType,
} from "../biDataService";
import { brl, brlCompact, COLOR, dateBr, monthLabel, pct } from "../biFormat";
import {
  ChartCard,
  ErrorBlock,
  KpiCard,
  LoadingBlock,
  MoneyTooltip,
  SeriesLegend,
  type BiFilters,
} from "../components/BiParts";

const TOP_N = 10;
const TREND_MONTHS = 12;

const RankedBars = ({ data, name }: { data: NamedValue[]; name: string }) => (
  <ChartContainer config={{}} className="aspect-auto w-full" style={{ height: Math.max(140, data.length * 34) }}>
    <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
      <CartesianGrid horizontal={false} strokeDasharray="3 3" />
      <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={brlCompact} />
      <YAxis
        type="category"
        dataKey="name"
        tickLine={false}
        axisLine={false}
        width={150}
        tickFormatter={(v: string) => (v.length > 21 ? `${v.slice(0, 20)}…` : v)}
      />
      <Tooltip cursor={{ fillOpacity: 0.15 }} content={<MoneyTooltip />} />
      <Bar dataKey="value" name={name} fill={COLOR.outflow} radius={[0, 4, 4, 0]} maxBarSize={18} />
    </BarChart>
  </ChartContainer>
);

const ExpensesTab = ({ filters }: { filters: BiFilters }) => {
  const { start, end, storeIds, selectedStoreIds, stores } = filters;
  const [dateType, setDateType] = useState<ExpenseDateType>("competence_date");
  const today = useMemo(() => toISODate(new Date()), []);
  const previous = useMemo(() => comparisonPeriod(start, end, today), [start, end, today]);
  // Periodo em andamento: a variacao compara so os dias ja decorridos dos dois lados.
  const inProgress = end > today && start <= today;
  const trendMonths = useMemo(() => lastMonthKeys(end, TREND_MONTHS), [end]);

  const periodQuery = useQuery({
    queryKey: ["bi", "expenses", "period", dateType, start, end, today, storeIds],
    queryFn: async () => {
      const expenseFilters = { dateType, start, end, storeIds: selectedStoreIds };
      const [cash, cashBefore, total, totalToDate, totalBefore, byGroup, bySupplier, byStore] = await Promise.all([
        fetchCashRows(start, end, storeIds),
        previous ? fetchCashRows(previous.start, previous.end, storeIds) : Promise.resolve([]),
        fetchExpenseTotal(expenseFilters),
        inProgress ? fetchExpenseTotal({ ...expenseFilters, end: today }) : Promise.resolve(null),
        previous
          ? fetchExpenseTotal({ ...expenseFilters, start: previous.start, end: previous.end })
          : Promise.resolve(0),
        fetchExpensesBy(expenseFilters, "group"),
        fetchExpensesBy(expenseFilters, "supplier"),
        fetchExpensesBy(expenseFilters, "store"),
      ]);
      return { cash, cashBefore, total, totalToDate: totalToDate ?? total, totalBefore, byGroup, bySupplier, byStore };
    },
  });

  // A evolucao mensal independe do inicio do periodo: sao sempre os 12 meses
  // que terminam no mes da data final.
  const trendQuery = useQuery({
    queryKey: ["bi", "expenses", "trend", dateType, trendMonths, storeIds],
    queryFn: async () => {
      const [cash, expenses] = await Promise.all([
        fetchCashRows(monthStart(trendMonths[0]), monthEnd(trendMonths[trendMonths.length - 1]), storeIds),
        fetchMonthlyExpenses(trendMonths, dateType, selectedStoreIds),
      ]);
      return revenueByMonth(cash, trendMonths).map((point) => {
        const expense = Math.round((expenses[point.key] ?? 0) * 100) / 100;
        return {
          month: point.key,
          revenue: point.value,
          expenses: expense,
          result: Math.round((point.value - expense) * 100) / 100,
        };
      });
    },
  });

  const view = useMemo(() => {
    if (!periodQuery.data) return null;
    const d = periodQuery.data;
    const revenue = summarizeRevenue(d.cash).total;
    const revenueBefore = summarizeRevenue(d.cashBefore).total;
    const result = revenue - d.total;
    const resultBefore = revenueBefore - d.totalBefore;

    const storeName = new Map(stores.map((s) => [s.id, s.name]));
    const revenueByStore = new Map<string, number>();
    for (const row of d.cash) {
      const name = storeName.get(row.store_id) ?? "Loja";
      revenueByStore.set(name, (revenueByStore.get(name) ?? 0) + Number(row.faturamento_total ?? 0));
    }

    return {
      revenue,
      revenueBefore,
      expenses: d.total,
      expensesToDate: d.totalToDate,
      expensesBefore: d.totalBefore,
      result,
      resultBefore,
      margin: revenue > 0 ? (result / revenue) * 100 : null,
      groups: topWithOthers(d.byGroup, TOP_N),
      suppliers: topWithOthers(d.bySupplier, TOP_N),
      storeRows: storeResults(
        Array.from(revenueByStore.entries()).map(([name, value]) => ({ name, value })),
        d.byStore,
      ),
    };
  }, [periodQuery.data, stores]);

  const header = (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 md:flex-row md:items-end md:justify-between">
      <p className="flex max-w-3xl items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          Despesas são os lançamentos de Contas a Pagar (os mesmos da aba Análise detalhada). Resultado aqui é
          faturamento do caixa menos essas despesas: uma leitura gerencial rápida, que não substitui o DRE (não
          considera estoque, aportes e retiradas, nem despesas de caixa sem vínculo com Contas a Pagar).
        </span>
      </p>
      <div className="w-full shrink-0 space-y-1 md:w-64">
        <Label htmlFor="bi-expense-date-type">Despesas por</Label>
        <Select value={dateType} onValueChange={(v) => setDateType(v as ExpenseDateType)}>
          <SelectTrigger id="bi-expense-date-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="competence_date">Data de competência</SelectItem>
            <SelectItem value="payment_date">Data de pagamento</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  if (periodQuery.isLoading) {
    return (
      <div className="space-y-6">
        {header}
        <LoadingBlock />
      </div>
    );
  }
  if (periodQuery.isError || !view) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorBlock onRetry={() => void periodQuery.refetch()} />
      </div>
    );
  }

  const comparison = previous
    ? `${inProgress ? "até hoje, " : ""}vs ${dateBr(previous.start)} a ${dateBr(previous.end)}`
    : "período ainda não iniciado";
  const trend = trendQuery.data ?? [];
  const trendEmpty = trend.every((m) => m.revenue === 0 && m.expenses === 0);

  return (
    <div className="space-y-6">
      {header}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Faturamento"
          value={brl(view.revenue)}
          delta={percentChange(view.revenue, view.revenueBefore)}
          deltaLabel={comparison}
        />
        <KpiCard
          label={dateType === "competence_date" ? "Despesas (competência)" : "Despesas pagas"}
          value={brl(view.expenses)}
          delta={percentChange(view.expensesToDate, view.expensesBefore)}
          deltaLabel={comparison}
          invertDelta
        />
        <KpiCard
          label="Resultado"
          value={brl(view.result)}
          tone={view.result < 0 ? "negative" : "positive"}
          hint={previous ? `${dateBr(previous.start)} a ${dateBr(previous.end)}: ${brl(view.resultBefore)}` : undefined}
        />
        <KpiCard
          label="Margem sobre o faturamento"
          value={pct(view.margin)}
          tone={view.margin !== null && view.margin < 0 ? "negative" : "default"}
          hint={
            view.revenue > 0
              ? `Despesas equivalem a ${pct((view.expenses / view.revenue) * 100)} do faturamento`
              : "Sem faturamento no período"
          }
        />
      </div>

      <ChartCard
        title="Faturamento, despesas e resultado por mês"
        description={`Últimos ${TREND_MONTHS} meses até ${monthLabel(trendMonths[trendMonths.length - 1])}, independente da data inicial do filtro.`}
        empty={!trendQuery.isLoading && !trendQuery.isError && trendEmpty}
      >
        {trendQuery.isLoading ? (
          <LoadingBlock label="Carregando evolução mensal..." />
        ) : trendQuery.isError ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Não foi possível carregar a evolução mensal.
          </p>
        ) : (
          <>
            <SeriesLegend
              items={[
                { color: COLOR.inflow, label: "Faturamento" },
                { color: COLOR.outflow, label: "Despesas" },
                { color: COLOR.result, label: "Resultado", line: true },
              ]}
            />
            <ChartContainer config={{}} className="aspect-auto h-[320px] w-full">
              <ComposedChart data={trend} margin={{ top: 16, right: 8, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickFormatter={monthLabel} minTickGap={8} />
                <YAxis tickLine={false} axisLine={false} width={88} tickFormatter={brlCompact} />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <Tooltip cursor={{ fillOpacity: 0.15 }} content={<MoneyTooltip labelFormatter={monthLabel} />} />
                <Bar dataKey="revenue" name="Faturamento" fill={COLOR.inflow} radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="expenses" name="Despesas" fill={COLOR.outflow} radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Line
                  dataKey="result"
                  name="Resultado"
                  type="monotone"
                  stroke={COLOR.result}
                  strokeWidth={2}
                  dot={{ r: 3, fill: COLOR.result, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ChartContainer>
          </>
        )}
      </ChartCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          title="Despesas por grupo"
          description={`Os ${TOP_N} maiores grupos; os demais ficam somados em "Demais".`}
          empty={view.groups.length === 0}
        >
          <RankedBars data={view.groups} name="Despesas" />
        </ChartCard>
        <ChartCard
          title="Despesas por fornecedor"
          description={`Os ${TOP_N} maiores fornecedores; os demais ficam somados em "Demais".`}
          empty={view.suppliers.length === 0}
        >
          <RankedBars data={view.suppliers} name="Despesas" />
        </ChartCard>
      </div>

      <ChartCard title="Resultado por loja" description="Faturamento menos despesas no período." empty={view.storeRows.length === 0}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loja</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
                <TableHead className="text-right">Despesas</TableHead>
                <TableHead className="text-right">Resultado</TableHead>
                <TableHead className="text-right">Margem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.storeRows.map((row) => (
                <TableRow key={row.name}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{brl(row.revenue)}</TableCell>
                  <TableCell className="text-right tabular-nums">{brl(row.expenses)}</TableCell>
                  <TableCell className={cn("text-right font-medium tabular-nums", row.result < 0 && "text-destructive")}>
                    {brl(row.result)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">{pct(row.margin)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="border-t-2 font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{brl(view.revenue)}</TableCell>
                <TableCell className="text-right tabular-nums">{brl(view.expenses)}</TableCell>
                <TableCell className={cn("text-right tabular-nums", view.result < 0 && "text-destructive")}>
                  {brl(view.result)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{pct(view.margin)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </ChartCard>
    </div>
  );
};

export default ExpensesTab;
