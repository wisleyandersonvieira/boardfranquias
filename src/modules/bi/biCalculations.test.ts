import test from "node:test";
import assert from "node:assert/strict";
import {
  agingTable,
  comparisonPeriod,
  expandOpenPayables,
  expandOpenReceivables,
  largestOverdue,
  lastMonthKeys,
  monthEnd,
  monthKeysBetween,
  percentChange,
  previousPeriod,
  revenueByDay,
  revenueByMonth,
  storePerformance,
  storeResults,
  summarizeOpen,
  summarizeRevenue,
  topWithOthers,
  weeklyProjection,
  type CashRow,
} from "./biCalculations.ts";

const cash = (store_id: string, date: string, total: number, parts: Partial<CashRow> = {}): CashRow => ({
  store_id,
  date,
  faturamento_total: total,
  faturamento_dinheiro: 0,
  faturamento_cartao: 0,
  faturamento_conta: 0,
  faturamento_delivery: 0,
  ...parts,
});

test("datas: meses, fim de mes e periodo anterior", () => {
  assert.deepEqual(monthKeysBetween("2026-11-15", "2027-01-03"), ["2026-11", "2026-12", "2027-01"]);
  assert.equal(monthEnd("2024-02"), "2024-02-29");
  assert.equal(monthEnd("2026-02"), "2026-02-28");
  assert.deepEqual(lastMonthKeys("2026-02-10", 3), ["2025-12", "2026-01", "2026-02"]);
  assert.deepEqual(previousPeriod("2026-11-01", "2026-11-30"), { start: "2026-10-02", end: "2026-10-31" });
  // periodo fechado: mesma quantidade de dias logo antes
  assert.deepEqual(comparisonPeriod("2026-10-01", "2026-10-31", "2026-11-19"), { start: "2026-08-31", end: "2026-09-30" });
  // mes em andamento: compara so os 19 dias decorridos
  assert.deepEqual(comparisonPeriod("2026-11-01", "2026-11-30", "2026-11-19"), { start: "2026-10-13", end: "2026-10-31" });
  assert.equal(comparisonPeriod("2026-12-01", "2026-12-31", "2026-11-19"), null);
  assert.equal(percentChange(120, 100), 20);
  assert.equal(percentChange(120, 0), null);
});

test("faturamento: total, formas de recebimento e media diaria", () => {
  const rows = [
    cash("a", "2026-11-01", 1000, { faturamento_dinheiro: 300, faturamento_cartao: 600 }),
    cash("b", "2026-11-01", 500, { faturamento_delivery: 500 }),
    cash("a", "2026-11-02", 0),
    cash("a", "2026-11-03", 250.1, { faturamento_conta: 250.1 }),
  ];
  const s = summarizeRevenue(rows);
  assert.equal(s.total, 1750.1);
  assert.equal(s.channels.dinheiro, 300);
  assert.equal(s.channels.cartao, 600);
  assert.equal(s.channels.delivery, 500);
  assert.equal(s.channels.conta, 250.1);
  // 1000 lancado, 900 distribuido -> 100 sem classificacao
  assert.equal(s.channels.outros, 100);
  assert.equal(s.daysWithRevenue, 2);
  assert.equal(s.dailyAverage, 875.05);

  const sum = Object.values(s.channels).reduce((a, b) => a + b, 0);
  assert.equal(Math.round(sum * 100) / 100, s.total);
});

test("faturamento: series diaria preenche dias vazios e mensal agrupa", () => {
  const rows = [cash("a", "2026-10-31", 10), cash("a", "2026-11-02", 20), cash("b", "2026-11-02", 5)];
  assert.deepEqual(revenueByDay(rows, "2026-10-31", "2026-11-02"), [
    { key: "2026-10-31", value: 10 },
    { key: "2026-11-01", value: 0 },
    { key: "2026-11-02", value: 25 },
  ]);
  assert.deepEqual(revenueByMonth(rows, ["2026-09", "2026-10", "2026-11"]), [
    { key: "2026-09", value: 0 },
    { key: "2026-10", value: 10 },
    { key: "2026-11", value: 25 },
  ]);
});

test("meta x realizado: soma metas dos meses do periodo e trata loja sem meta", () => {
  const rows = [cash("a", "2026-11-01", 800), cash("a", "2026-12-01", 400), cash("b", "2026-11-05", 2000)];
  const goals = [
    { store_id: "a", year: 2026, month: 11, goal_value: 1000 },
    { store_id: "a", year: 2026, month: 12, goal_value: 1000 },
    { store_id: "a", year: 2026, month: 10, goal_value: 9999 }, // fora do periodo
  ];
  const stores = [
    { id: "a", name: "Loja A" },
    { id: "b", name: "Loja B" },
    { id: "c", name: "Loja C" },
  ];
  const perf = storePerformance(rows, goals, stores, ["2026-11", "2026-12"]);
  assert.deepEqual(
    perf.map((p) => [p.name, p.revenue, p.goal, p.achieved]),
    [
      ["Loja B", 2000, 0, null],
      ["Loja A", 1200, 2000, 60],
      ["Loja C", 0, 0, null],
    ],
  );
});

test("despesas: top N com 'Demais' preserva o total", () => {
  const items = [
    { name: "A", value: 50 },
    { name: "B", value: 30 },
    { name: "C", value: 15 },
    { name: "D", value: 5 },
    { name: "Zero", value: 0 },
  ];
  const top = topWithOthers(items, 2);
  assert.deepEqual(top, [
    { name: "A", value: 50 },
    { name: "B", value: 30 },
    { name: "Demais", value: 20 },
  ]);
  assert.equal(topWithOthers(items, 10).length, 4);
});

test("resultado por loja: faturamento - despesas e margem", () => {
  const res = storeResults(
    [
      { name: "Loja A", value: 1000 },
      { name: "Loja B", value: 0 },
    ],
    [
      { name: "Loja A", value: 750 },
      { name: "Loja B", value: 100 },
    ],
  );
  assert.deepEqual(res, [
    { name: "Loja A", revenue: 1000, expenses: 750, result: 250, margin: 25 },
    { name: "Loja B", revenue: 0, expenses: 100, result: -100, margin: null },
  ]);
});

test("contas a pagar em aberto: parcelas nao quitadas e ajuste de juros/desconto", () => {
  const items = expandOpenPayables([
    { store_id: "a", status: "paid", amount: 999, due_date: "2026-11-01" },
    {
      store_id: "a",
      status: "partial",
      amount: 300,
      due_date: "2026-11-01",
      party: "Fornecedor X",
      installments: [
        { amount: 100, due_date: "2026-11-01", payment_date: "2026-11-01" },
        { amount: 100, due_date: "2026-12-01", payment_date: null },
        { amount: 100, due_date: "2027-01-01", payment_date: null },
      ],
    },
    {
      store_id: "b",
      status: "pending",
      amount: 200,
      due_date: "2026-11-20",
      payments: [{ interest_amount: 10, discount_amount: 4 }],
    },
  ]);
  assert.deepEqual(
    items.map((i) => [i.party, i.dueDate, i.amount]),
    [
      ["Fornecedor X", "2026-12-01", 100],
      ["Fornecedor X", "2027-01-01", 100],
      ["Sem fornecedor", "2026-11-20", 206],
    ],
  );
});

test("contas a receber em aberto: parcial sem parcelas nao entra", () => {
  const items = expandOpenReceivables([
    { store_id: "a", status: "received", amount: 999, due_date: "2026-11-01" },
    { store_id: "a", status: "pending", amount: 150, due_date: "2026-11-25", party: "Cliente" },
    { store_id: "a", status: "partial", amount: 500, due_date: "2026-11-25" },
    {
      store_id: "a",
      status: "partial",
      amount: 400,
      due_date: "2026-11-01",
      installments: [
        { amount: 200, due_date: "2026-11-01", payment_date: "2026-11-02" },
        { amount: 200, due_date: "2026-12-01", payment_date: null },
      ],
    },
  ]);
  assert.deepEqual(
    items.map((i) => [i.party, i.dueDate, i.amount]),
    [
      ["Cliente", "2026-11-25", 150],
      ["Sem credor", "2026-12-01", 200],
    ],
  );
});

const open = (dueDate: string, amount: number, party = "P") => ({
  storeId: "a",
  party,
  description: "",
  dueDate,
  amount,
});

test("aberto: resumo, faixas de vencimento e maiores vencidos", () => {
  const today = "2026-11-19";
  const items = [
    open("2026-10-01", 100), // vencido ha 49 dias
    open("2026-11-18", 50), // vencido ha 1 dia
    open("2026-11-19", 30), // hoje
    open("2026-11-26", 20), // 7 dias
    open("2026-11-27", 10), // 8 dias
    open("2026-12-19", 5), // 30 dias
    open("2026-12-20", 4), // 31 dias
    open("2027-03-01", 1), // > 60
  ];
  const s = summarizeOpen(items, today);
  assert.equal(s.total, 220);
  assert.equal(s.overdue, 150);
  assert.equal(s.overdueCount, 2);
  assert.equal(s.dueToday, 30);
  assert.equal(s.next7, 50);
  assert.equal(s.next30, 65);

  const aging = agingTable(items, [open("2026-11-20", 7)], today);
  assert.deepEqual(
    aging.map((r) => [r.id, r.payable, r.receivable]),
    [
      ["overdue_30_plus", 100, 0],
      ["overdue_1_30", 50, 0],
      ["next_7", 50, 7],
      ["next_8_30", 15, 0],
      ["next_31_60", 4, 0],
      ["next_60_plus", 1, 0],
    ],
  );
  // As faixas cobrem tudo: a soma bate com o total em aberto.
  assert.equal(
    aging.reduce((sum, r) => sum + r.payable, 0),
    s.total,
  );

  assert.deepEqual(
    largestOverdue(items, today, 5).map((i) => [i.amount, i.daysLate]),
    [
      [100, 49],
      [50, 1],
    ],
  );
});

test("fluxo previsto: janelas de 7 dias, ignora vencidos e acumula saldo", () => {
  const today = "2026-11-19";
  const weeks = weeklyProjection(
    [open("2026-11-18", 999), open("2026-11-19", 100), open("2026-11-26", 40), open("2027-06-01", 999)],
    [open("2026-11-25", 300), open("2026-12-02", 10)],
    today,
    3,
  );
  assert.deepEqual(
    weeks.map((w) => [w.start, w.end, w.payable, w.receivable, w.net, w.cumulative]),
    [
      ["2026-11-19", "2026-11-25", 100, 300, 200, 200],
      ["2026-11-26", "2026-12-02", 40, 10, -30, 170],
      ["2026-12-03", "2026-12-09", 0, 0, 0, 170],
    ],
  );
});
