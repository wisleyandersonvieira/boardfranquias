/**
 * Calculos do painel de BI. Tudo aqui e funcao pura (sem Supabase, sem React)
 * para poder ser testado isoladamente - veja biCalculations.test.ts.
 *
 * Datas circulam como texto ISO "AAAA-MM-DD" e a aritmetica e feita em UTC,
 * para o fuso do navegador nunca deslocar um dia.
 */

export type ISODate = string;

const DAY_MS = 24 * 60 * 60 * 1000;

const toUtc = (iso: ISODate): number => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

const fromUtc = (ms: number): ISODate => new Date(ms).toISOString().slice(0, 10);

export const toISODate = (date: Date): ISODate =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export const addDays = (iso: ISODate, days: number): ISODate => fromUtc(toUtc(iso) + days * DAY_MS);

/** Diferenca em dias (b - a). */
export const diffDays = (a: ISODate, b: ISODate): number => Math.round((toUtc(b) - toUtc(a)) / DAY_MS);

export const monthKey = (iso: ISODate): string => iso.slice(0, 7);

export const monthStart = (key: string): ISODate => `${key}-01`;

export const monthEnd = (key: string): ISODate => {
  const [y, m] = key.split("-").map(Number);
  return fromUtc(Date.UTC(y, m, 0));
};

/** Meses (AAAA-MM) tocados pelo intervalo, em ordem. */
export const monthKeysBetween = (start: ISODate, end: ISODate): string[] => {
  const keys: string[] = [];
  let [y, m] = start.slice(0, 7).split("-").map(Number);
  const last = monthKey(end);
  for (let guard = 0; guard < 600; guard++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key > last) break;
    keys.push(key);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
};

/** Os `count` meses que terminam no mes de `end` (inclusive), em ordem. */
export const lastMonthKeys = (end: ISODate, count: number): string[] => {
  const [y, m] = end.slice(0, 7).split("-").map(Number);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    keys.push(d.toISOString().slice(0, 7));
  }
  return keys;
};

/** Periodo imediatamente anterior, com a mesma quantidade de dias. */
export const previousPeriod = (start: ISODate, end: ISODate): { start: ISODate; end: ISODate } => {
  const length = diffDays(start, end) + 1;
  return { start: addDays(start, -length), end: addDays(start, -1) };
};

/**
 * Base de comparacao de um periodo. Se o periodo ainda esta em andamento
 * (termina depois de hoje), compara apenas os dias ja decorridos com a mesma
 * quantidade de dias imediatamente anteriores - senao um mes pela metade seria
 * comparado a um mes cheio. Null quando o periodo ainda nao comecou.
 */
export const comparisonPeriod = (
  start: ISODate,
  end: ISODate,
  today: ISODate,
): { start: ISODate; end: ISODate } | null => {
  if (start > today) return null;
  return previousPeriod(start, end > today ? today : end);
};

/** Variacao percentual; null quando nao ha base de comparacao. */
export const percentChange = (current: number, previous: number): number | null =>
  previous > 0 ? ((current - previous) / previous) * 100 : null;

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

// ---------------------------------------------------------------------------
// Faturamento (controle de caixa)
// ---------------------------------------------------------------------------

export interface CashRow {
  store_id: string;
  date: ISODate;
  faturamento_total: number | null;
  faturamento_dinheiro: number | null;
  faturamento_cartao: number | null;
  faturamento_conta: number | null;
  faturamento_delivery: number | null;
}

export interface GoalRow {
  store_id: string;
  year: number;
  month: number;
  goal_value: number | null;
}

export interface StoreRef {
  id: string;
  name: string;
}

export type ChannelKey = "dinheiro" | "cartao" | "conta" | "delivery" | "outros";

export const CHANNEL_LABELS: Record<ChannelKey, string> = {
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  conta: "Conta",
  delivery: "Delivery",
  outros: "Não classificado",
};

export interface RevenueSummary {
  total: number;
  channels: Record<ChannelKey, number>;
  /** Dias distintos com faturamento lancado (> 0) em alguma loja. */
  daysWithRevenue: number;
  /** Media por dia com faturamento. */
  dailyAverage: number;
}

export const summarizeRevenue = (rows: CashRow[]): RevenueSummary => {
  const channels: Record<ChannelKey, number> = { dinheiro: 0, cartao: 0, conta: 0, delivery: 0, outros: 0 };
  const days = new Set<string>();
  let total = 0;

  for (const row of rows) {
    const rowTotal = num(row.faturamento_total);
    total += rowTotal;
    channels.dinheiro += num(row.faturamento_dinheiro);
    channels.cartao += num(row.faturamento_cartao);
    channels.conta += num(row.faturamento_conta);
    channels.delivery += num(row.faturamento_delivery);
    if (rowTotal > 0) days.add(row.date.slice(0, 10));
  }

  // O total do caixa e a referencia; o que nao estiver distribuido nas formas
  // de recebimento aparece como "Não classificado" em vez de sumir.
  const classified = channels.dinheiro + channels.cartao + channels.conta + channels.delivery;
  channels.outros = Math.max(0, round2(total - classified));

  (Object.keys(channels) as ChannelKey[]).forEach((key) => {
    channels[key] = round2(channels[key]);
  });

  return {
    total: round2(total),
    channels,
    daysWithRevenue: days.size,
    dailyAverage: days.size > 0 ? round2(total / days.size) : 0,
  };
};

export interface SeriesPoint {
  key: string;
  value: number;
}

/** Um ponto por dia do intervalo (dias sem lancamento ficam com zero). */
export const revenueByDay = (rows: CashRow[], start: ISODate, end: ISODate): SeriesPoint[] => {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = row.date.slice(0, 10);
    totals.set(key, (totals.get(key) ?? 0) + num(row.faturamento_total));
  }
  const points: SeriesPoint[] = [];
  const length = diffDays(start, end);
  for (let i = 0; i <= length; i++) {
    const key = addDays(start, i);
    points.push({ key, value: round2(totals.get(key) ?? 0) });
  }
  return points;
};

export const revenueByMonth = (rows: CashRow[], keys: string[]): SeriesPoint[] => {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = monthKey(row.date);
    totals.set(key, (totals.get(key) ?? 0) + num(row.faturamento_total));
  }
  return keys.map((key) => ({ key, value: round2(totals.get(key) ?? 0) }));
};

export interface StorePerformance {
  storeId: string;
  name: string;
  revenue: number;
  goal: number;
  /** % da meta atingido; null quando a loja nao tem meta no periodo. */
  achieved: number | null;
}

/**
 * Faturamento x meta por loja. A meta e mensal, entao soma-se a meta cheia de
 * cada mes tocado pelo periodo (mesma regra do Dashboard inicial).
 */
export const storePerformance = (
  rows: CashRow[],
  goals: GoalRow[],
  stores: StoreRef[],
  months: string[],
): StorePerformance[] => {
  const monthSet = new Set(months);
  const revenue = new Map<string, number>();
  const goal = new Map<string, number>();

  for (const row of rows) {
    revenue.set(row.store_id, (revenue.get(row.store_id) ?? 0) + num(row.faturamento_total));
  }
  for (const g of goals) {
    const key = `${g.year}-${String(g.month).padStart(2, "0")}`;
    if (!monthSet.has(key)) continue;
    goal.set(g.store_id, (goal.get(g.store_id) ?? 0) + num(g.goal_value));
  }

  return stores
    .map((store) => {
      const r = round2(revenue.get(store.id) ?? 0);
      const g = round2(goal.get(store.id) ?? 0);
      return {
        storeId: store.id,
        name: store.name,
        revenue: r,
        goal: g,
        achieved: g > 0 ? (r / g) * 100 : null,
      };
    })
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
};

// ---------------------------------------------------------------------------
// Despesas / resultado
// ---------------------------------------------------------------------------

export interface NamedValue {
  name: string;
  value: number;
}

/** Mantem os `limit` maiores e junta o restante em uma linha "Demais". */
export const topWithOthers = (items: NamedValue[], limit: number, othersLabel = "Demais"): NamedValue[] => {
  const sorted = [...items].filter((i) => round2(i.value) !== 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= limit) return sorted.map((i) => ({ ...i, value: round2(i.value) }));
  const head = sorted.slice(0, limit).map((i) => ({ ...i, value: round2(i.value) }));
  const rest = sorted.slice(limit).reduce((sum, i) => sum + i.value, 0);
  return [...head, { name: othersLabel, value: round2(rest) }];
};

export interface StoreResult {
  name: string;
  revenue: number;
  expenses: number;
  result: number;
  /** Resultado / faturamento; null sem faturamento. */
  margin: number | null;
}

export const storeResults = (revenueByStore: NamedValue[], expensesByStore: NamedValue[]): StoreResult[] => {
  const map = new Map<string, { revenue: number; expenses: number }>();
  for (const r of revenueByStore) {
    const entry = map.get(r.name) ?? { revenue: 0, expenses: 0 };
    entry.revenue += r.value;
    map.set(r.name, entry);
  }
  for (const e of expensesByStore) {
    const entry = map.get(e.name) ?? { revenue: 0, expenses: 0 };
    entry.expenses += e.value;
    map.set(e.name, entry);
  }
  return Array.from(map.entries())
    .map(([name, v]) => {
      const revenue = round2(v.revenue);
      const expenses = round2(v.expenses);
      const result = round2(revenue - expenses);
      return { name, revenue, expenses, result, margin: revenue > 0 ? (result / revenue) * 100 : null };
    })
    .filter((s) => s.revenue !== 0 || s.expenses !== 0)
    .sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
};

// ---------------------------------------------------------------------------
// Contas a pagar / receber em aberto
// ---------------------------------------------------------------------------

export interface OpenItem {
  storeId: string;
  party: string;
  description: string;
  dueDate: ISODate;
  amount: number;
}

interface InstallmentLike {
  amount: number | null;
  due_date: string;
  payment_date: string | null;
}

export interface PayableLike {
  store_id: string;
  status: string;
  amount: number | null;
  due_date: string;
  description?: string | null;
  party?: string | null;
  installments?: InstallmentLike[] | null;
  payments?: { interest_amount: number | null; discount_amount: number | null }[] | null;
}

export interface ReceivableLike {
  store_id: string;
  status: string;
  amount: number | null;
  due_date: string;
  description?: string | null;
  party?: string | null;
  installments?: InstallmentLike[] | null;
}

/**
 * Titulos a pagar em aberto, uma linha por parcela nao quitada.
 * Mesma regra do relatorio "Contas a Pagar": lancamento sem parcelas entra pelo
 * valor do cabecalho ajustado por juros/descontos de pagamentos ja registrados.
 */
export const expandOpenPayables = (accounts: PayableLike[]): OpenItem[] => {
  const items: OpenItem[] = [];
  for (const account of accounts) {
    if (account.status === "paid") continue;
    const base = {
      storeId: account.store_id,
      party: account.party || "Sem fornecedor",
      description: account.description || "",
    };
    const installments = account.installments ?? [];
    if (installments.length > 0) {
      for (const inst of installments) {
        if (inst.payment_date) continue;
        items.push({ ...base, dueDate: inst.due_date.slice(0, 10), amount: round2(num(inst.amount)) });
      }
    } else {
      const adjust = (account.payments ?? []).reduce(
        (sum, p) => sum + num(p.interest_amount) - num(p.discount_amount),
        0,
      );
      items.push({ ...base, dueDate: account.due_date.slice(0, 10), amount: round2(num(account.amount) + adjust) });
    }
  }
  return items;
};

/** Titulos a receber em aberto - mesma regra do relatorio "Contas a Receber". */
export const expandOpenReceivables = (accounts: ReceivableLike[]): OpenItem[] => {
  const items: OpenItem[] = [];
  for (const account of accounts) {
    if (account.status !== "pending" && account.status !== "partial") continue;
    const base = {
      storeId: account.store_id,
      party: account.party || "Sem credor",
      description: account.description || "",
    };
    const installments = account.installments ?? [];
    if (installments.length > 0) {
      for (const inst of installments) {
        if (inst.payment_date) continue;
        items.push({ ...base, dueDate: inst.due_date.slice(0, 10), amount: round2(num(inst.amount)) });
      }
    } else if (account.status === "pending") {
      items.push({ ...base, dueDate: account.due_date.slice(0, 10), amount: round2(num(account.amount)) });
    }
  }
  return items;
};

export interface OpenSummary {
  total: number;
  overdue: number;
  overdueCount: number;
  dueToday: number;
  next7: number;
  next30: number;
  count: number;
}

export const summarizeOpen = (items: OpenItem[], today: ISODate): OpenSummary => {
  const summary: OpenSummary = { total: 0, overdue: 0, overdueCount: 0, dueToday: 0, next7: 0, next30: 0, count: items.length };
  for (const item of items) {
    const days = diffDays(today, item.dueDate);
    summary.total += item.amount;
    if (days < 0) {
      summary.overdue += item.amount;
      summary.overdueCount += 1;
    } else {
      if (days === 0) summary.dueToday += item.amount;
      if (days <= 7) summary.next7 += item.amount;
      if (days <= 30) summary.next30 += item.amount;
    }
  }
  (["total", "overdue", "dueToday", "next7", "next30"] as const).forEach((k) => {
    summary[k] = round2(summary[k]);
  });
  return summary;
};

export const AGING_BUCKETS = [
  { id: "overdue_30_plus", label: "Vencido há +30 dias" },
  { id: "overdue_1_30", label: "Vencido até 30 dias" },
  { id: "next_7", label: "Hoje a 7 dias" },
  { id: "next_8_30", label: "8 a 30 dias" },
  { id: "next_31_60", label: "31 a 60 dias" },
  { id: "next_60_plus", label: "Acima de 60 dias" },
] as const;

export type AgingBucketId = (typeof AGING_BUCKETS)[number]["id"];

export const agingBucketOf = (dueDate: ISODate, today: ISODate): AgingBucketId => {
  const days = diffDays(today, dueDate);
  if (days < -30) return "overdue_30_plus";
  if (days < 0) return "overdue_1_30";
  if (days <= 7) return "next_7";
  if (days <= 30) return "next_8_30";
  if (days <= 60) return "next_31_60";
  return "next_60_plus";
};

export interface AgingRow {
  id: AgingBucketId;
  label: string;
  payable: number;
  receivable: number;
}

export const agingTable = (payables: OpenItem[], receivables: OpenItem[], today: ISODate): AgingRow[] => {
  const rows = new Map<AgingBucketId, AgingRow>(
    AGING_BUCKETS.map((b) => [b.id, { id: b.id, label: b.label, payable: 0, receivable: 0 }]),
  );
  for (const item of payables) rows.get(agingBucketOf(item.dueDate, today))!.payable += item.amount;
  for (const item of receivables) rows.get(agingBucketOf(item.dueDate, today))!.receivable += item.amount;
  return AGING_BUCKETS.map((b) => {
    const row = rows.get(b.id)!;
    return { ...row, payable: round2(row.payable), receivable: round2(row.receivable) };
  });
};

export interface WeekProjection {
  start: ISODate;
  end: ISODate;
  payable: number;
  receivable: number;
  net: number;
  /** Saldo acumulado das semanas (receber - pagar), partindo de zero. */
  cumulative: number;
}

/**
 * Fluxo previsto: janelas de 7 dias a partir de hoje. Titulos ja vencidos nao
 * entram (nao ha data prevista para eles) - a tela mostra o vencido a parte.
 */
export const weeklyProjection = (
  payables: OpenItem[],
  receivables: OpenItem[],
  today: ISODate,
  weeks = 8,
): WeekProjection[] => {
  const result: WeekProjection[] = [];
  for (let i = 0; i < weeks; i++) {
    result.push({
      start: addDays(today, i * 7),
      end: addDays(today, i * 7 + 6),
      payable: 0,
      receivable: 0,
      net: 0,
      cumulative: 0,
    });
  }
  const indexOf = (dueDate: ISODate): number => {
    const days = diffDays(today, dueDate);
    if (days < 0) return -1;
    const index = Math.floor(days / 7);
    return index < weeks ? index : -1;
  };
  for (const item of payables) {
    const i = indexOf(item.dueDate);
    if (i >= 0) result[i].payable += item.amount;
  }
  for (const item of receivables) {
    const i = indexOf(item.dueDate);
    if (i >= 0) result[i].receivable += item.amount;
  }
  let running = 0;
  for (const week of result) {
    week.payable = round2(week.payable);
    week.receivable = round2(week.receivable);
    week.net = round2(week.receivable - week.payable);
    running = round2(running + week.net);
    week.cumulative = running;
  }
  return result;
};

export const sumByParty = (items: OpenItem[]): NamedValue[] => {
  const map = new Map<string, number>();
  for (const item of items) map.set(item.party, (map.get(item.party) ?? 0) + item.amount);
  return Array.from(map.entries()).map(([name, value]) => ({ name, value: round2(value) }));
};

/** Os maiores titulos vencidos, do maior para o menor. */
export const largestOverdue = (items: OpenItem[], today: ISODate, limit: number): (OpenItem & { daysLate: number })[] =>
  items
    .map((item) => ({ ...item, daysLate: -diffDays(today, item.dueDate) }))
    .filter((item) => item.daysLate > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
