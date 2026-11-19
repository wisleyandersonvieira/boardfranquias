import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis, Tooltip } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CHANNEL_LABELS,
  diffDays,
  monthKeysBetween,
  percentChange,
  comparisonPeriod,
  toISODate,
  revenueByDay,
  revenueByMonth,
  storePerformance,
  summarizeRevenue,
  type ChannelKey,
} from "../biCalculations";
import { fetchCashRows, fetchGoals } from "../biDataService";
import { brl, brlCompact, COLOR, dateBr, dayMonth, monthLabel, pct } from "../biFormat";
import {
  ChartCard,
  ErrorBlock,
  KpiCard,
  LoadingBlock,
  MoneyTooltip,
  ProgressBar,
  SeriesLegend,
  type BiFilters,
} from "../components/BiParts";

/** Acima disso o grafico diario fica ilegivel e passa a ser mensal. */
const MAX_DAILY_POINTS = 62;
const MAX_STORES_IN_CHART = 12;

const RevenueTab = ({ filters }: { filters: BiFilters }) => {
  const { start, end, storeIds, stores } = filters;
  const today = useMemo(() => toISODate(new Date()), []);
  const previous = useMemo(() => comparisonPeriod(start, end, today), [start, end, today]);
  const inProgress = end > today && start <= today;
  const months = useMemo(() => monthKeysBetween(start, end), [start, end]);

  const query = useQuery({
    queryKey: ["bi", "revenue", start, end, storeIds],
    queryFn: async () => {
      const [current, before, goals] = await Promise.all([
        fetchCashRows(start, end, storeIds),
        previous ? fetchCashRows(previous.start, previous.end, storeIds) : Promise.resolve([]),
        fetchGoals(months, storeIds),
      ]);
      return { current, before, goals };
    },
  });

  const view = useMemo(() => {
    if (!query.data) return null;
    const { current, before, goals } = query.data;
    const summary = summarizeRevenue(current);
    const previousTotal = summarizeRevenue(before).total;
    const visibleStores = stores.filter((s) => storeIds.includes(s.id));
    const performance = storePerformance(current, goals, visibleStores, months);
    const goalTotal = performance.reduce((sum, p) => sum + p.goal, 0);

    const daily = diffDays(start, end) + 1 <= MAX_DAILY_POINTS;
    const series = daily
      ? revenueByDay(current, start, end).map((p) => ({ label: p.key, value: p.value }))
      : revenueByMonth(current, months).map((p) => ({ label: p.key, value: p.value }));

    const channels = (Object.keys(summary.channels) as ChannelKey[])
      .map((key) => ({
        name: CHANNEL_LABELS[key],
        value: summary.channels[key],
        share: summary.total > 0 ? (summary.channels[key] / summary.total) * 100 : 0,
      }))
      .filter((c) => c.value > 0)
      .sort((a, b) => b.value - a.value);

    return { summary, previousTotal, performance, goalTotal, daily, series, channels };
  }, [query.data, stores, storeIds, months, start, end]);

  if (query.isLoading) return <LoadingBlock />;
  if (query.isError || !view) return <ErrorBlock onRetry={() => void query.refetch()} />;

  const { summary, previousTotal, performance, goalTotal, daily, series, channels } = view;
  const achieved = goalTotal > 0 ? (summary.total / goalTotal) * 100 : null;
  const chartStores = performance.filter((p) => p.revenue > 0 || p.goal > 0).slice(0, MAX_STORES_IN_CHART);
  const hasGoals = goalTotal > 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Faturamento no período"
          value={brl(summary.total)}
          delta={previous ? percentChange(summary.total, previousTotal) : null}
          deltaLabel={previous ? `${inProgress ? "até hoje, " : ""}vs ${dateBr(previous.start)} a ${dateBr(previous.end)}` : "período ainda não iniciado"}
        />
        <KpiCard
          label="Meta do período"
          value={hasGoals ? brl(goalTotal) : "Sem meta"}
          hint={
            hasGoals
              ? months.length > 1
                ? `Soma das metas mensais de ${monthLabel(months[0])} a ${monthLabel(months[months.length - 1])}`
                : `Meta mensal de ${monthLabel(months[0])}`
              : "Cadastre em Cadastros > Metas"
          }
        />
        <KpiCard
          label="Atingimento da meta"
          value={pct(achieved)}
          tone={achieved === null ? "default" : achieved >= 100 ? "positive" : "default"}
          hint={
            achieved === null
              ? "Sem meta cadastrada"
              : achieved >= 100
                ? `Meta superada em ${brl(summary.total - goalTotal)}`
                : `Faltam ${brl(goalTotal - summary.total)}`
          }
        />
        <KpiCard
          label="Média por dia com venda"
          value={brl(summary.dailyAverage)}
          hint={`${summary.daysWithRevenue} ${summary.daysWithRevenue === 1 ? "dia" : "dias"} com faturamento lançado`}
        />
      </div>

      <ChartCard
        title={daily ? "Faturamento por dia" : "Faturamento por mês"}
        description="Soma do faturamento total lançado no Controle de Caixa."
        empty={summary.total === 0}
        emptyText="Nenhum faturamento lançado no Controle de Caixa para este período."
      >
        <ChartContainer config={{}} className="aspect-auto h-[280px] w-full">
          <BarChart data={series} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              tickFormatter={(v: string) => (daily ? dayMonth(v) : monthLabel(v))}
            />
            <YAxis tickLine={false} axisLine={false} width={88} tickFormatter={brlCompact} />
            <Tooltip
              cursor={{ fillOpacity: 0.15 }}
              content={<MoneyTooltip labelFormatter={(v) => (daily ? dateBr(v) : monthLabel(v))} />}
            />
            <Bar dataKey="value" name="Faturamento" fill={COLOR.inflow} radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ChartContainer>
      </ChartCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          title="Formas de recebimento"
          description="Participação de cada forma no faturamento do período."
          empty={channels.length === 0}
        >
          <ChartContainer
            config={{}}
            className="aspect-auto w-full"
            style={{ height: Math.max(140, channels.length * 48) }}
          >
            <BarChart data={channels} layout="vertical" margin={{ top: 0, right: 96, left: 8, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={110} />
              <Tooltip cursor={{ fillOpacity: 0.15 }} content={<MoneyTooltip />} />
              <Bar dataKey="value" name="Faturamento" fill={COLOR.inflow} radius={[0, 4, 4, 0]} maxBarSize={22}>
                <LabelList
                  dataKey="share"
                  position="right"
                  className="fill-foreground"
                  formatter={(v: number) => pct(v)}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
          <Table className="mt-4">
            <TableBody>
              {channels.map((c) => (
                <TableRow key={c.name}>
                  <TableCell className="py-2">{c.name}</TableCell>
                  <TableCell className="py-2 text-right tabular-nums">{brl(c.value)}</TableCell>
                  <TableCell className="w-20 py-2 text-right tabular-nums text-muted-foreground">
                    {pct(c.share)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ChartCard>

        <ChartCard
          title="Meta x realizado por loja"
          description={
            performance.length > chartStores.length
              ? `As ${chartStores.length} lojas de maior faturamento. A lista completa está na tabela abaixo.`
              : "Faturamento do período comparado à meta de cada loja."
          }
          empty={chartStores.length === 0}
        >
          <SeriesLegend
            items={[
              { color: COLOR.inflow, label: "Realizado" },
              { color: COLOR.reference, label: "Meta" },
            ]}
          />
          <ChartContainer
            config={{}}
            className="aspect-auto w-full"
            style={{ height: Math.max(160, chartStores.length * 52) }}
          >
            <BarChart data={chartStores} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barGap={2}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={brlCompact} />
              <YAxis
                type="category"
                dataKey="name"
                tickLine={false}
                axisLine={false}
                width={130}
                tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
              />
              <Tooltip cursor={{ fillOpacity: 0.15 }} content={<MoneyTooltip />} />
              <Bar dataKey="revenue" name="Realizado" fill={COLOR.inflow} radius={[0, 4, 4, 0]} maxBarSize={16} />
              <Bar dataKey="goal" name="Meta" fill={COLOR.reference} radius={[0, 4, 4, 0]} maxBarSize={16} />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      <ChartCard title="Ranking de lojas" description="Ordenado pelo faturamento do período." empty={performance.length === 0}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Loja</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
                <TableHead className="text-right">Participação</TableHead>
                <TableHead className="text-right">Meta</TableHead>
                <TableHead className="w-[220px]">Atingimento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {performance.map((store, index) => (
                <TableRow key={store.storeId}>
                  <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="font-medium">{store.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{brl(store.revenue)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {pct(summary.total > 0 ? (store.revenue / summary.total) * 100 : null)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{store.goal > 0 ? brl(store.goal) : "-"}</TableCell>
                  <TableCell>
                    {store.achieved === null ? (
                      <span className="text-xs text-muted-foreground">Sem meta</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <ProgressBar value={store.achieved} />
                        <span className="w-14 shrink-0 text-right text-xs tabular-nums">{pct(store.achieved, 0)}</span>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ChartCard>
    </div>
  );
};

export default RevenueTab;
