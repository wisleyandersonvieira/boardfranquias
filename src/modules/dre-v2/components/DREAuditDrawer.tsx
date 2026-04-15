import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DREAuditEntry } from "@/modules/dre-v2/types";
import { formatCurrency } from "@/modules/dre-v2/utils";

interface DREAuditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: DREAuditEntry;
}

export function DREAuditDrawer({ open, onOpenChange, entry }: DREAuditDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[92vw] sm:max-w-4xl">
        <SheetHeader>
          <SheetTitle>{entry?.lineName || "Conferencia da linha"}</SheetTitle>
          <SheetDescription>
            Total apurado: {formatCurrency(entry?.total || 0)}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="mt-6 h-[calc(100vh-140px)] pr-4">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Regime: {entry?.filters.regime === "cash" ? "Caixa" : "Competencia"}</Badge>
              <Badge variant="outline">Ano: {entry?.filters.year || "-"}</Badge>
              <Badge variant="outline">Meses: {(entry?.filters.months || []).join(", ") || "-"}</Badge>
              <Badge variant="outline">Lojas: {(entry?.filters.storeIds || []).length}</Badge>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Criterio</TableHead>
                  <TableHead>Loja</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Descricao</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(entry?.records || []).map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{record.dateUsed}</TableCell>
                    <TableCell>{record.dateCriterion}</TableCell>
                    <TableCell>{record.storeName || record.storeId}</TableCell>
                    <TableCell>{record.documentNumber || "-"}</TableCell>
                    <TableCell>{record.description || "-"}</TableCell>
                    <TableCell>{record.sourceTable}</TableCell>
                    <TableCell>{record.subgroupName || record.subgroupId || "-"}</TableCell>
                    <TableCell>{record.paymentStatus || "-"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(record.value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
