import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { Info } from "lucide-react";
import { ChartContainer } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  agingTable,
  expandOpenPayables,
  expandOpenReceivables,
  largestOverdue,
  sumByParty,
  summarizeOpen,
  toISODate,
  topWithOthers,
  weeklyProjection,
} from "../biCalculations";
import { fetchOpenPayables, fetchOpenReceivables } from "../biDataService";
import { brl, brlCompact, COLOR, dateBr, dayMonth } from "../biFormat";
import {
  ChartCard,
  ErrorBlock,
  KpiCard,
  LoadingBlock,
  MoneyTooltip,
  SeriesLegend,
  type BiFilters,
} from "../components/BiParts";

const WEEKS = 8;
const TOP_N = 8;

const AccountsTab = ({ filters }: { filters: BiFilters }) => {
  const { storeIds, stores } = filters;
  const today = useMemo(() => toISODate(new Date()), []);

  const query = useQuery({
    queryKey: ["bi", "open-accounts", storeIds],
    queryFn: async () => {
      const [payables, receivables] = await Promise.all([fetchOpenPayables(storeIds), fetchOpenReceivables(storeIds)]);
      return { payables: expandOpenPayables(payables), receivables: expandOpenReceivables(receivables) };
    },
  });

  const view = useMemo(() => {
    if (!query.data) return null;
    const { payables, receivables } = query.data;
    const storeName = new Map(stores.map((s) => [s.id, s.name]));
    const weeks = weeklyProjection(payables, receivables, today, WEEKS).map((w) => ({
      ...w,
      label: `${dayMonth(w.start)} a ${dayMonth(w.end)}`,
    }));
    return {
      pay: summarizeOpen(payables, today),
      rec: summarizeOpen(receivables, today),
      aging: agingTable(payables, receivables, today),
      weeks,
      topSuppliers: topWithOthers(sumByParty(payables), TOP_N),
      overdue: largestOverdue(payables, today, 10).map((i) => ({ ...i, store: storeName.get(i.storeId) ?? "-" })),
    };
  }, [query.data, stores, today]);

  if (query.isLoading) return <LoadingBlock />;
  if (query.isError || !view) return <ErrorBlock onRetry={() => void query.refetch()} />;

  const { pay, rec, aging, weeks, topSuppliers, overdue } = view;
  const balance = rec.total - pay.total;
  const next30Net = rec.next30 - pay.next30;
  const titles = (n: number) => `${n} ${n === 1 ? "título" : "títulos"}`;

  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-lg border bg-card p-4 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          Posição de hoje ({dateBr(today)}): todos os títulos em aberto das lojas selecionadas. O período do filtro
          não se aplica a esta aba.
        </span>
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="A pagar em aberto" value={brl(pay.total)} hint={titles(pay.count)} />
        <KpiCard
          label="A pagar vencido"
          value={brl(pay.overdue)}
          tone={pay.overdue > 0 ? "negative" : "default"}
          hint={pay.overdue > 0 ? titles(pay.overdueCount) : "Nada vencido"}
        />
        <KpiCard label="A receber em aberto" value={brl(rec.total)} hint={titles(rec.count)} />
        <KpiCard
          label="A receber vencido"
          value={brl(rec.overdue)}
          tone={rec.overdue > 0 ? "negative" : "default"}
          hint={rec.overdue > 0 ? titles(rec.overdueCount) : "Nada vencido"}
        />
        <KpiCard
          label="Saldo dos próximos 30 dias"
          value={brl(next30Net)}
          tone={next30Net < 0 ? "negative" : "positive"}
          hint={`Receber ${brl(rec.next30)} − pagar ${brl(pay.next30)}`}
        />
      </div>

      <ChartCard
        title={`Fluxo previsto para as próximas ${WEEKS} semanas`}
        description="Títulos a receber e a pagar por semana de vencimento e o saldo acumulado entre eles. Não parte do saldo bancário e não inclui o que já venceu."
        empty={weeks.every((w) => w.payable === 0 && w.receivable === 0)}
        emptyText={`Nenhum título vence nas próximas ${WEEKS} semanas.`}
      >
        <SeriesLegend
          items={[
            { color: COLOR.inflow, label: "A receber" },
            { color: COLOR.outflow, label: "A pagar" },
            { color: COLOR.result, label: "Saldo acumulado", line: true },
          ]}
        />
        <ChartContainer config={{}} className="aspect-auto h-[320px] w-full">
          <ComposedChart data={weeks} margin={{ top: 16, right: 8, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={8} />
            <YAxis tickLine={false} axisLine={false} width={88} tickFormatter={brlCompact} />
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <Tooltip cursor={{ fillOpacity: 0.15 }} content={<MoneyTooltip />} />
            <Bar dataKey="receivable" name="A receber" fill={COLOR.inflow} radius={[4, 4, 0, 0]} maxBarSize={26} />
            <Bar dataKey="payable" name="A pagar" fill={COLOR.outflow} radius={[4, 4, 0, 0]} maxBarSize={26} />
            <Line
              dataKey="cumulative"
              name="Saldo acumulado"
              type="monotone"
              stroke={COLOR.result}
              strokeWidth={2}
              dot={{ r: 3, fill: COLOR.result, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ChartContainer>
      </ChartCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard
          title="Em aberto por faixa de vencimento"
          description={`Saldo total em aberto (receber − pagar): ${brl(balance)}.`}
          empty={pay.count === 0 && rec.count === 0}
        >
          <SeriesLegend
            items={[
              { color: COLOR.inflow, label: "A receber" },
              { color: COLOR.outflow, label: "A pagar" },
            ]}
          />
          <ChartContainer config={{}} className="aspect-auto h-[300px] w-full">
            <BarChart data={aging} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barGap={2}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={brlCompact} />
              <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={130} />
              <Tooltip cursor={{ fillOpacity: 0.15 }} content={<MoneyTooltip />} />
              <Bar dataKey="receivable" name="A receber" fill={COLOR.inflow} radius={[0, 4, 4, 0]} maxBarSize={14} />
              <Bar dataKey="payable" name="A pagar" fill={COLOR.outflow} radius={[0, 4, 4, 0]} maxBarSize={14} />
            </BarChart>
          </ChartContainer>
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>Faixa</TableHead>
                <TableHead className="text-right">A receber</TableHead>
                <TableHead className="text-right">A pagar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aging.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="py-2">{row.label}</TableCell>
                  <TableCell className="py-2 text-right tabular-nums">{brl(row.receivable)}</TableCell>
                  <TableCell className="py-2 text-right tabular-nums">{brl(row.payable)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ChartCard>

        <ChartCard
          title="A pagar em aberto por fornecedor"
          description={`Os ${TOP_N} maiores; os demais ficam somados em "Demais".`}
          empty={topSuppliers.length === 0}
        >
          <ChartContainer
            config={{}}
            className="aspect-auto w-full"
            style={{ height: Math.max(140, topSuppliers.length * 34) }}
          >
            <BarChart data={topSuppliers} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
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
              <Bar dataKey="value" name="A pagar" fill={COLOR.outflow} radius={[0, 4, 4, 0]} maxBarSize={18} />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      <ChartCard
        title="Maiores títulos a pagar vencidos"
        description="Os 10 de maior valor."
        empty={overdue.length === 0}
        emptyText="Nenhum título a pagar vencido."
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Loja</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Dias em atraso</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overdue.map((item, index) => (
                <TableRow key={`${item.party}-${item.dueDate}-${index}`}>
                  <TableCell className="font-medium">{item.party}</TableCell>
                  <TableCell className="max-w-[280px] truncate text-muted-foreground">{item.description || "-"}</TableCell>
                  <TableCell>{item.store}</TableCell>
                  <TableCell className="tabular-nums">{dateBr(item.dueDate)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", item.daysLate > 30 && "text-destructive")}>
                    {item.daysLate}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{brl(item.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ChartCard>
    </div>
  );
};

export default AccountsTab;
