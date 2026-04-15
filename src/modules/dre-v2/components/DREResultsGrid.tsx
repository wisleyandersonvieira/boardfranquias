import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DREApuracaoResult, DREValueDisplayMode, DREViewMode } from "@/modules/dre-v2/types";
import { formatCurrency, formatPercent, getColumnRevenue } from "@/modules/dre-v2/utils";

interface DREGridProps {
  result: DREApuracaoResult;
  mode: DREViewMode;
  valueDisplayMode: DREValueDisplayMode;
  hideZeroLines: boolean;
  emphasizePrimary: boolean;
  onInspectLine: (lineId: string) => void;
}

function renderCell(value: number, revenue: number, valueDisplayMode: DREValueDisplayMode) {
  if (valueDisplayMode === "percent") {
    return <div className="text-sm font-semibold">{formatPercent(revenue ? value / revenue : null)}</div>;
  }

  if (valueDisplayMode === "value") {
    return <div className="text-sm font-semibold tabular-nums">{formatCurrency(value)}</div>;
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="text-sm font-semibold tabular-nums">{formatCurrency(value)}</div>
      <div className="text-[11px] text-muted-foreground">{formatPercent(revenue ? value / revenue : null)}</div>
    </div>
  );
}

export function DREResultsGrid({ result, mode, valueDisplayMode, hideZeroLines, emphasizePrimary, onInspectLine }: DREGridProps) {
  const visibleIds = useMemo(() => new Set(result.visibleLineIdsByMode[mode]), [mode, result.visibleLineIdsByMode]);
  const visibleLines = useMemo(
    () =>
      result.lineResults
        .filter((line) => visibleIds.has(line.item.id))
        .filter((line) => !hideZeroLines || result.columns.some((column) => (line.valuesByColumn[column.id] || 0) !== 0) || line.total !== 0),
    [hideZeroLines, result.columns, result.lineResults, visibleIds],
  );

  return (
    <Card className="border-slate-200 bg-white/95 shadow-sm">
      <CardHeader>
        <CardTitle>DRE {mode === "synthetic" ? "Sintetico" : "Analitico"}</CardTitle>
        <CardDescription>
          Clique em grupos e linhas analíticas para abrir a conferência detalhada. Linhas de soma exibem apenas o total calculado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full whitespace-nowrap rounded-lg border">
          <Table className="min-w-[980px]">
            <TableHeader className="sticky top-0 z-10 bg-slate-50">
              <TableRow>
                <TableHead className="sticky left-0 z-20 min-w-[320px] bg-slate-50 text-slate-700">Descrição</TableHead>
                {result.columns.map((column) => (
                  <TableHead key={column.id} className="min-w-[160px] border-l text-right">
                    <div className="text-center font-semibold">{column.label}</div>
                    {column.storeName ? (
                      <div className="text-center text-[11px] text-muted-foreground">{column.storeName}</div>
                    ) : null}
                  </TableHead>
                ))}
                <TableHead className="min-w-[160px] border-l text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleLines.map((line) => (
                  <TableRow
                    key={line.item.id}
                    className={
                      line.item.itemType === "sum_line"
                        ? "bg-slate-200/80"
                        : line.item.itemType === "group"
                          ? "bg-slate-50"
                          : ""
                    }
                  >
                    <TableCell
                      className={`sticky left-0 z-10 border-r bg-white ${
                        line.item.itemType === "sum_line"
                          ? "bg-slate-200/80 font-bold"
                          : line.item.itemType === "group"
                            ? "bg-slate-50 font-semibold"
                            : ""
                      }`}
                    >
                      {line.item.itemType === "sum_line" ? (
                        <div className="px-0 py-1" style={{ paddingLeft: `${line.item.level * 18}px` }}>
                          {line.item.name}
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          className="h-auto w-full justify-start px-0 py-1 text-left"
                          onClick={() => onInspectLine(line.item.id)}
                        >
                          <span
                            className={emphasizePrimary && line.item.itemType !== "group" && line.item.itemType !== "sum_line" ? "text-slate-600" : ""}
                            style={{ paddingLeft: `${line.item.level * 18}px` }}
                          >
                            {line.item.name}
                          </span>
                        </Button>
                      )}
                    </TableCell>
                    {result.columns.map((column) => {
                      const value = line.valuesByColumn[column.id] || 0;
                      const revenue = getColumnRevenue(result, column.id);
                      return (
                        <TableCell key={column.id} className="border-l text-right">
                          {renderCell(value, revenue, valueDisplayMode)}
                        </TableCell>
                      );
                    })}
                    <TableCell className="border-l text-right">
                      {renderCell(line.total, result.lineResults[0]?.total || 0, valueDisplayMode === "percent" ? "percent" : "value")}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
