import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DREApuracaoResult, DREViewMode } from "@/modules/dre-v2/types";
import { formatCurrency, formatPercent, getColumnRevenue } from "@/modules/dre-v2/utils";

interface DREGridProps {
  result: DREApuracaoResult;
  mode: DREViewMode;
  showPercentages: boolean;
  onInspectLine: (lineId: string) => void;
}

export function DREResultsGrid({ result, mode, showPercentages, onInspectLine }: DREGridProps) {
  const visibleIds = useMemo(() => new Set(result.visibleLineIdsByMode[mode]), [mode, result.visibleLineIdsByMode]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>DRE {mode === "synthetic" ? "Sintetico" : "Analitico"}</CardTitle>
        <CardDescription>
          Clique em qualquer linha para abrir a conferencia detalhada do total.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full whitespace-nowrap rounded-lg border">
          <Table className="min-w-[980px]">
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead className="sticky left-0 z-20 min-w-[280px] bg-background">Descricao</TableHead>
                {result.columns.map((column) => (
                  <TableHead key={column.id} className="min-w-[160px] text-right">
                    <div>{column.label}</div>
                    {column.storeName ? (
                      <div className="text-xs text-muted-foreground">{column.storeName}</div>
                    ) : null}
                  </TableHead>
                ))}
                <TableHead className="min-w-[160px] text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.lineResults
                .filter((line) => visibleIds.has(line.item.id))
                .map((line) => (
                  <TableRow
                    key={line.item.id}
                    className={line.item.itemType === "sum_line" || line.item.itemType === "group" ? "bg-muted/30" : ""}
                  >
                    <TableCell className="sticky left-0 z-10 bg-background">
                      <Button
                        variant="ghost"
                        className="h-auto w-full justify-start px-0 text-left"
                        onClick={() => onInspectLine(line.item.id)}
                      >
                        <span style={{ paddingLeft: `${line.item.level * 18}px` }}>{line.item.name}</span>
                      </Button>
                    </TableCell>
                    {result.columns.map((column) => {
                      const value = line.valuesByColumn[column.id] || 0;
                      const revenue = getColumnRevenue(result, column.id);
                      return (
                        <TableCell key={column.id} className="text-right">
                          <div>{formatCurrency(value)}</div>
                          {showPercentages ? (
                            <div className="text-xs text-muted-foreground">{formatPercent(revenue ? value / revenue : null)}</div>
                          ) : null}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right font-semibold">{formatCurrency(line.total)}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
