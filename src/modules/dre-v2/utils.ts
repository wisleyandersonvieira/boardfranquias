import type {
  DREApuracaoResult,
  DRELineResult,
  DREOriginRecord,
  DREStructureDefinition,
  DREStructureItem,
} from "@/modules/dre-v2/types";

export const DRE_MONTHS = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Fev" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Abr" },
  { value: 5, label: "Mai" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Ago" },
  { value: 9, label: "Set" },
  { value: 10, label: "Out" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dez" },
];

export function formatCurrency(value: number): string {
  const absolute = Math.abs(value || 0);
  const formatted = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absolute);

  return value < 0 ? `-${formatted}` : formatted;
}

export function formatPercent(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function monthKeyFromDate(date: string): string {
  const [year, month] = date.split("-");
  return `${year}-${month}`;
}

export function getMonthYearFromDate(date: string): { year: number; month: number } {
  const [year, month] = date.split("-");
  return {
    year: Number(year),
    month: Number(month),
  };
}

export function buildColumnId(year: number, month: number, storeId?: string): string {
  return storeId ? `${year}-${String(month).padStart(2, "0")}-${storeId}` : `${year}-${String(month).padStart(2, "0")}`;
}

export function sumValues(records: DREOriginRecord[]): number {
  return records.reduce((acc, record) => acc + record.value, 0);
}

export function findLineByName(result: DREApuracaoResult, patterns: string[]): DRELineResult | undefined {
  const loweredPatterns = patterns.map((pattern) => pattern.toLowerCase());
  return result.lineResults.find((line) =>
    loweredPatterns.some((pattern) => line.item.name.toLowerCase().includes(pattern)),
  );
}

export function calculatePercent(value: number, revenue: number): number | null {
  if (!revenue) {
    return null;
  }

  return value / revenue;
}

export function getColumnRevenue(result: DREApuracaoResult, columnId: string): number {
  const revenueLine =
    findLineByName(result, ["faturamento", "receita bruta", "receita total", "receitas"]) ??
    result.lineResults.find((line) => line.total > 0);

  return revenueLine?.valuesByColumn[columnId] || 0;
}

export function normalizeMonths(months: number[]): number[] {
  const base = months.length > 0 ? months : DRE_MONTHS.map((month) => month.value);
  return [...new Set(base)].sort((left, right) => left - right);
}

export function getVisibleItems(
  structure: DREStructureDefinition,
  mode: "synthetic" | "analytic",
): DREStructureItem[] {
  if (mode === "analytic") {
    return structure.items;
  }

  return structure.items.filter((item) => item.itemType !== "subgroup");
}

export function buildCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
}

export function formatDateTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function formatPeriodLabel(year: number, months: number[]): string {
  const normalized = normalizeMonths(months);
  if (normalized.length === 0) {
    return String(year);
  }

  if (normalized.length === 1) {
    const month = DRE_MONTHS.find((entry) => entry.value === normalized[0])?.label || normalized[0];
    return `${month} de ${year}`;
  }

  const first = DRE_MONTHS.find((entry) => entry.value === normalized[0])?.label || normalized[0];
  const last = DRE_MONTHS.find((entry) => entry.value === normalized[normalized.length - 1])?.label || normalized[normalized.length - 1];
  return `${first} a ${last} de ${year}`;
}
