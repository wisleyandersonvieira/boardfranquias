import { ReactNode } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Loader2, Minus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { biChartConfig, brl, pct } from "../biFormat";

const themeCss = (mode: "light" | "dark") =>
  Object.entries(biChartConfig)
    .map(([key, cfg]) => `--color-${key}: ${cfg.theme[mode]};`)
    .join(" ");

/**
 * Publica as cores das series como variaveis CSS no escopo do painel, para
 * graficos, legendas e barras de progresso usarem exatamente os mesmos tons
 * (com passos proprios para o tema escuro).
 */
export const BiThemeStyle = () => (
  <style>{`.bi-root { ${themeCss("light")} } .dark .bi-root { ${themeCss("dark")} }`}</style>
);

export interface BiFilters {
  start: string;
  end: string;
  /** Lojas efetivas da consulta (as selecionadas ou todas as acessiveis). */
  storeIds: string[];
  /** Lojas escolhidas no filtro; vazio = todas. */
  selectedStoreIds: string[];
  stores: { id: string; name: string }[];
}

/** Legenda manual (quadradinho + nome), em tinta de texto e nao na cor da serie. */
export const SeriesLegend = ({ items }: { items: { color: string; label: string; line?: boolean }[] }) => (
  <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
    {items.map((item) => (
      <li key={item.label} className="flex items-center gap-1.5">
        <span
          className={item.line ? "h-0.5 w-3 rounded-full" : "h-2.5 w-2.5 rounded-[2px]"}
          style={{ backgroundColor: item.color }}
          aria-hidden
        />
        {item.label}
      </li>
    ))}
  </ul>
);

interface KpiCardProps {
  label: string;
  value: string;
  /** Linha de apoio abaixo do valor. */
  hint?: ReactNode;
  /** Variacao percentual contra a base de comparacao; null = sem base. */
  delta?: number | null;
  deltaLabel?: string;
  /** Quando subir e ruim (ex.: despesas), inverte o sentido da cor. */
  invertDelta?: boolean;
  tone?: "default" | "positive" | "negative";
}

export const KpiCard = ({ label, value, hint, delta, deltaLabel, invertDelta, tone = "default" }: KpiCardProps) => {
  const hasDelta = delta !== undefined;
  const flat = delta === null || delta === undefined || Math.abs(delta) < 0.05;
  const good = !flat && (invertDelta ? delta! < 0 : delta! > 0);
  const DeltaIcon = flat ? Minus : delta! > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        <p
          className={cn(
            "text-2xl font-bold tabular-nums",
            tone === "positive" && "text-emerald-600 dark:text-emerald-400",
            tone === "negative" && "text-destructive",
          )}
        >
          {value}
        </p>
        {hasDelta && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                flat ? "text-muted-foreground" : good ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
              )}
            >
              <DeltaIcon className="h-3.5 w-3.5" aria-hidden />
              {delta === null || delta === undefined ? "sem base" : pct(Math.abs(delta))}
              <span className="sr-only">{flat ? "estável" : delta! > 0 ? "de alta" : "de queda"}</span>
            </span>
            {deltaLabel}
          </p>
        )}
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
};

interface ChartCardProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Mostra o aviso de "sem dados" no lugar do conteudo. */
  empty?: boolean;
  emptyText?: string;
}

export const ChartCard = ({ title, description, children, className, empty, emptyText }: ChartCardProps) => (
  <Card className={className}>
    <CardHeader className="pb-2">
      <CardTitle className="text-base">{title}</CardTitle>
      {description && <CardDescription>{description}</CardDescription>}
    </CardHeader>
    <CardContent>
      {empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {emptyText ?? "Sem dados para os filtros selecionados."}
        </p>
      ) : (
        children
      )}
    </CardContent>
  </Card>
);

export const LoadingBlock = ({ label = "Carregando indicadores..." }: { label?: string }) => (
  <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground" role="status">
    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
    {label}
  </div>
);

export const ErrorBlock = ({ onRetry }: { onRetry: () => void }) => (
  <Card>
    <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
      <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
      <p className="text-sm text-muted-foreground">Não foi possível carregar os dados desta aba.</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Tentar novamente
      </Button>
    </CardContent>
  </Card>
);

interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

interface MoneyTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: TooltipEntry[];
  /** Converte o rotulo do eixo em texto (ex.: data ISO -> dd/mm/aaaa). */
  labelFormatter?: (label: string) => string;
}

/** Tooltip padrao dos graficos: rotulo + uma linha por serie, em reais. */
export const MoneyTooltip = ({ active, label, payload, labelFormatter }: MoneyTooltipProps) => {
  if (!active || !payload || payload.length === 0) return null;
  const text = label === undefined ? "" : labelFormatter ? labelFormatter(String(label)) : String(label);
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
      {text && <p className="mb-1 font-medium text-foreground">{text}</p>}
      <ul className="space-y-0.5">
        {payload.map((entry) => (
          <li key={String(entry.dataKey ?? entry.name)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: entry.color }} aria-hidden />
              {entry.name}
            </span>
            <span className="font-medium tabular-nums text-foreground">{brl(Number(entry.value ?? 0))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/** Barra de progresso simples (% da meta). Passa de 100% sem estourar o trilho. */
export const ProgressBar = ({ value }: { value: number | null }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-muted/30" aria-hidden>
    <div
      className="h-full rounded-full"
      style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%`, backgroundColor: "var(--color-inflow)" }}
    />
  </div>
);
