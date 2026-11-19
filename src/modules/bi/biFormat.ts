import type { ChartConfig } from "@/components/ui/chart";

export const brl = (value: number | null | undefined): string =>
  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Moeda abreviada para eixos e rotulos: R$ 950, R$ 12,5 mil, R$ 1,2 mi. */
export const brlCompact = (value: number): string => {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const fmt = (n: number, digits: number) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: digits });
  if (abs >= 1_000_000) return `${sign}R$ ${fmt(abs / 1_000_000, 1)} mi`;
  if (abs >= 1_000) return `${sign}R$ ${fmt(abs / 1_000, abs >= 100_000 ? 0 : 1)} mil`;
  return `${sign}R$ ${fmt(abs, 0)}`;
};

export const pct = (value: number | null | undefined, digits = 1): string =>
  value === null || value === undefined || !Number.isFinite(value)
    ? "-"
    : `${value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

export const dateBr = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

export const dayMonth = (iso: string): string => {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
};

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-11" -> "nov/26" */
export const monthLabel = (key: string): string => {
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1]}/${y.slice(2)}`;
};

/**
 * Cores das series. Seguem a entidade, nunca a posicao: tudo que e dinheiro
 * entrando (faturamento, a receber) e azul; dinheiro saindo (despesas, a pagar)
 * e laranja; resultado/saldo e verde-agua; referencia (meta) e cinza.
 * Par azul/laranja escolhido por se manter distinguivel para daltonicos.
 */
export const biChartConfig = {
  inflow: { label: "Entradas", theme: { light: "#2a78d6", dark: "#3987e5" } },
  outflow: { label: "Saídas", theme: { light: "#eb6834", dark: "#d95926" } },
  result: { label: "Resultado", theme: { light: "#1baf7a", dark: "#199e70" } },
  reference: { label: "Meta", theme: { light: "#898781", dark: "#898781" } },
} satisfies ChartConfig;

export const COLOR = {
  inflow: "var(--color-inflow)",
  outflow: "var(--color-outflow)",
  result: "var(--color-result)",
  reference: "var(--color-reference)",
} as const;
