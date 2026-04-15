import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { DREApuracaoResult } from "@/modules/dre-v2/types";
import { formatCurrency } from "@/modules/dre-v2/utils";

interface DREDiagnosticsCardProps {
  result: DREApuracaoResult;
}

export function DREDiagnosticsCard({ result }: DREDiagnosticsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Diagnostico</CardTitle>
        <CardDescription>
          {result.records.length} registros elegiveis lidos em {result.diagnostics.executionTimeMs} ms
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 md:grid-cols-3">
          {result.diagnostics.originCounters.slice(0, 6).map((counter) => (
            <div key={counter.label} className="rounded-lg border p-3">
              <div className="text-sm text-muted-foreground">{counter.label}</div>
              <div className="text-lg font-semibold">{counter.count} registros</div>
              <div className="text-sm">{formatCurrency(counter.amount)}</div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <h3 className="font-medium">Validacoes</h3>
          <div className="flex flex-col gap-2">
            {result.diagnostics.validations.map((validation) => (
              <div key={validation.code} className="flex items-start justify-between gap-4 rounded-lg border p-3">
                <div>
                  <div className="font-medium">{validation.message}</div>
                  {validation.details ? (
                    <div className="text-sm text-muted-foreground">{validation.details}</div>
                  ) : null}
                </div>
                <Badge
                  variant={
                    validation.status === "ok"
                      ? "default"
                      : validation.status === "warning"
                        ? "secondary"
                        : "destructive"
                  }
                >
                  {validation.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-medium">Achados de Estrutura</h3>
          <div className="flex flex-col gap-2">
            {result.diagnostics.findings.length === 0 ? (
              <div className="rounded-lg border p-3 text-sm text-muted-foreground">
                Nenhuma inconsistência estrutural encontrada na leitura da estrutura.
              </div>
            ) : (
              result.diagnostics.findings.map((finding, index) => (
                <div key={`${finding.code}-${index}`} className="flex items-start justify-between gap-4 rounded-lg border p-3">
                  <div>{finding.message}</div>
                  <Badge
                    variant={
                      finding.severity === "info"
                        ? "outline"
                        : finding.severity === "warning"
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {finding.severity}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
