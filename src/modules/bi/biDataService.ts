import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/utils/supabasePagination";
import type { CashRow, GoalRow, ISODate, NamedValue, PayableLike, ReceivableLike, StoreRef } from "./biCalculations";
import { monthEnd, monthStart } from "./biCalculations";

/**
 * Acesso a dados do painel de BI.
 *
 * - Faturamento, metas e titulos em aberto: leitura direta das tabelas, sujeita
 *   as politicas RLS do usuario logado.
 * - Despesas: reaproveita as funcoes get_bi_report / get_bi_report_totals que ja
 *   alimentam a analise detalhada, para os numeros baterem entre as abas.
 *
 * Nenhuma migration nova e necessaria.
 */

export type ExpenseDateType = "competence_date" | "payment_date";

type RpcResponse<T> = PromiseLike<{ data: T[] | null; error: Error | null }>;
type RpcClient = { rpc: <T>(fn: string, args: Record<string, unknown>) => RpcResponse<T> };
const rpcClient = supabase as unknown as RpcClient;

const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T[]> => {
  const { data, error } = await rpcClient.rpc<T>(fn, args);
  if (error) throw error;
  return data ?? [];
};

/** Lojas que o usuario pode ver no BI (mesma regra das funcoes do banco). */
export const fetchBiStores = async (): Promise<StoreRef[]> => {
  const ids = await rpc<string>("get_bi_accessible_store_ids", {});
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("stores").select("id, name").in("id", ids).order("name");
  if (error) throw error;
  return data ?? [];
};

export const fetchCashRows = async (start: ISODate, end: ISODate, storeIds: string[]): Promise<CashRow[]> => {
  if (storeIds.length === 0) return [];
  return fetchAllPaginated<CashRow>((from, to) =>
    supabase
      .from("cash_control")
      .select(
        "store_id, date, faturamento_total, faturamento_dinheiro, faturamento_cartao, faturamento_conta, faturamento_delivery",
      )
      .gte("date", start)
      .lte("date", end)
      .in("store_id", storeIds)
      // Ordem estavel: sem ela a paginacao pode repetir ou pular linhas.
      .order("date")
      .order("id")
      .range(from, to),
  );
};

export const fetchGoals = async (months: string[], storeIds: string[]): Promise<GoalRow[]> => {
  if (storeIds.length === 0 || months.length === 0) return [];
  const years = Array.from(new Set(months.map((m) => Number(m.slice(0, 4)))));
  return fetchAllPaginated<GoalRow>((from, to) =>
    supabase
      .from("store_goals")
      .select("store_id, year, month, goal_value")
      .in("year", years)
      .in("store_id", storeIds)
      .order("id")
      .range(from, to),
  );
};

// --------------------------------------------------------------------------
// Despesas (contas a pagar) via funcoes do BI
// --------------------------------------------------------------------------

export interface ExpenseFilters {
  dateType: ExpenseDateType;
  start: ISODate;
  end: ISODate;
  /** Vazio = todas as lojas acessiveis. */
  storeIds: string[];
}

const expenseArgs = (f: ExpenseFilters) => ({
  p_date_type: f.dateType,
  p_start_date: f.start,
  p_end_date: f.end,
  p_store_ids: f.storeIds.length > 0 ? f.storeIds : null,
  p_supplier_ids: null,
  p_group_ids: null,
  p_subgroup_ids: null,
});

export type ExpenseDimension = "store" | "supplier" | "group";

type BiReportRow = {
  store_name: string | null;
  supplier_name: string | null;
  group_name: string | null;
  total_value: number | null;
  total_rows: number;
};

const DIMENSION_FIELD: Record<ExpenseDimension, keyof BiReportRow> = {
  store: "store_name",
  supplier: "supplier_name",
  group: "group_name",
};

const RPC_PAGE = 1000;

export const fetchExpensesBy = async (filters: ExpenseFilters, dimension: ExpenseDimension): Promise<NamedValue[]> => {
  const all: NamedValue[] = [];
  for (let offset = 0; offset < 50 * RPC_PAGE; offset += RPC_PAGE) {
    const rows = await rpc<BiReportRow>("get_bi_report", {
      ...expenseArgs(filters),
      p_columns: [dimension, "value"],
      p_sort_column: "value",
      p_sort_direction: "desc",
      p_limit: RPC_PAGE,
      p_offset: offset,
    });
    for (const row of rows) {
      all.push({ name: String(row[DIMENSION_FIELD[dimension]] ?? "-"), value: Number(row.total_value ?? 0) });
    }
    if (rows.length < RPC_PAGE) break;
  }
  return all;
};

export const fetchExpenseTotal = async (filters: ExpenseFilters): Promise<number> => {
  const rows = await rpc<{ total_value: number | null }>("get_bi_report_totals", expenseArgs(filters));
  return Number(rows[0]?.total_value ?? 0);
};

/** Total de despesas de cada mes informado (uma chamada por mes, em paralelo). */
export const fetchMonthlyExpenses = async (
  months: string[],
  dateType: ExpenseDateType,
  storeIds: string[],
): Promise<Record<string, number>> => {
  const totals = await Promise.all(
    months.map((key) => fetchExpenseTotal({ dateType, start: monthStart(key), end: monthEnd(key), storeIds })),
  );
  return Object.fromEntries(months.map((key, i) => [key, totals[i]]));
};

// --------------------------------------------------------------------------
// Titulos em aberto
// --------------------------------------------------------------------------

type PayableRow = {
  store_id: string;
  status: string;
  amount: number | null;
  due_date: string;
  description: string | null;
  suppliers: { name: string } | null;
  employees: { name: string } | null;
  accounts_payable_installments: { amount: number | null; due_date: string; payment_date: string | null }[] | null;
  accounts_payable_payments: { interest_amount: number | null; discount_amount: number | null }[] | null;
};

export const fetchOpenPayables = async (storeIds: string[]): Promise<PayableLike[]> => {
  if (storeIds.length === 0) return [];
  const rows = await fetchAllPaginated<PayableRow>((from, to) =>
    supabase
      .from("accounts_payable")
      .select(
        `store_id, status, amount, due_date, description,
         suppliers(name),
         employees(name),
         accounts_payable_installments(amount, due_date, payment_date),
         accounts_payable_payments(interest_amount, discount_amount)`,
      )
      .neq("status", "paid")
      .in("store_id", storeIds)
      .order("id")
      .range(from, to) as unknown as PromiseLike<{ data: PayableRow[] | null; error: unknown }>,
  );
  return rows.map((row) => ({
    store_id: row.store_id,
    status: row.status,
    amount: row.amount,
    due_date: row.due_date,
    description: row.description,
    party: row.suppliers?.name ?? row.employees?.name ?? null,
    installments: row.accounts_payable_installments,
    payments: row.accounts_payable_payments,
  }));
};

type ReceivableRow = {
  store_id: string;
  status: string;
  amount: number | null;
  due_date: string;
  description: string | null;
  creditors: { name: string } | null;
  accounts_receivable_installments: { amount: number | null; due_date: string; payment_date: string | null }[] | null;
};

export const fetchOpenReceivables = async (storeIds: string[]): Promise<ReceivableLike[]> => {
  if (storeIds.length === 0) return [];
  const rows = await fetchAllPaginated<ReceivableRow>((from, to) =>
    supabase
      .from("accounts_receivable")
      .select(
        `store_id, status, amount, due_date, description,
         creditors(name),
         accounts_receivable_installments(amount, due_date, payment_date)`,
      )
      .in("status", ["pending", "partial"])
      .in("store_id", storeIds)
      .order("id")
      .range(from, to) as unknown as PromiseLike<{ data: ReceivableRow[] | null; error: unknown }>,
  );
  return rows.map((row) => ({
    store_id: row.store_id,
    status: row.status,
    amount: row.amount,
    due_date: row.due_date,
    description: row.description,
    party: row.creditors?.name ?? null,
    installments: row.accounts_receivable_installments,
  }));
};
