import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DREAuditEntry, DREOriginRecord } from "@/modules/dre-v2/types";
import {
  buildSmartDocumentLabel,
  formatCurrency,
  formatDateTime,
  formatShortDate,
  getFriendlyOriginLabel,
  getFriendlyStatus,
} from "@/modules/dre-v2/utils";
import { getPdfLogoCache, warmPdfLogoCache } from "@/utils/pdfHeader";

interface DREAuditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: DREAuditEntry;
}

type DetailRow = {
  data: string;
  loja: string;
  documento: string;
  fornecedor: string;
  origem: string;
  produto: string;
  status: string;
  valor: string;
};

function getMonthLabels(months: number[]): string {
  if (!months || months.length === 0) {
    return "-";
  }

  return months
    .slice()
    .sort((left, right) => left - right)
    .map((month) => String(month).padStart(2, "0"))
    .join(", ");
}

function getSelectedStoreLabels(entry?: DREAuditEntry): string {
  const storeNames = [...new Set((entry?.records || []).map((record) => record.storeName || record.storeId).filter(Boolean))];
  if (storeNames.length > 0) {
    return storeNames.join(", ");
  }

  return (entry?.filters.storeIds || []).length > 0 ? `${entry?.filters.storeIds.length} loja(s)` : "Todas";
}

function mapDetailRow(record: DREOriginRecord): DetailRow {
  return {
    data: formatShortDate(record.dateUsed),
    loja: record.storeName || record.storeId || "-",
    documento: buildSmartDocumentLabel(record.documentNumber, record.description),
    fornecedor: record.supplierName || "—",
    origem: record.friendlyOrigin || getFriendlyOriginLabel(record.origin),
    produto: record.categoryLabel || record.subgroupName || record.subgroupId || "—",
    status: getFriendlyStatus(record.paymentStatus).label,
    valor: formatCurrency(record.value),
  };
}

function buildExportRows(entry?: DREAuditEntry): DetailRow[] {
  return (entry?.records || []).map(mapDetailRow);
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportDetailsExcel(entry?: DREAuditEntry): void {
  if (!entry) {
    return;
  }

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(
    buildExportRows(entry).map((row) => ({
      Data: row.data,
      Loja: row.loja,
      Documento: row.documento,
      Fornecedor: row.fornecedor,
      Origem: row.origem,
      Produto: row.produto,
      Status: row.status,
      Valor: row.valor,
    })),
  );
  XLSX.utils.book_append_sheet(workbook, worksheet, "Detalhamento DRE");
  XLSX.writeFile(workbook, `detalhamento-dre-${entry.lineName.toLowerCase().replace(/\s+/g, "-")}.xlsx`);
}

async function exportDetailsPdf(entry?: DREAuditEntry): Promise<void> {
  if (!entry) {
    return;
  }

  await warmPdfLogoCache();
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 34;
  const headerY = 26;
  const titleColor = [15, 23, 42];
  const subtle = [100, 116, 139];
  const border = [226, 232, 240];
  const accent = [30, 64, 175];
  const rows = buildExportRows(entry);

  const drawHeader = (pageNumber: number) => {
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(marginX, headerY, pageWidth - marginX * 2, 96, 10, 10, "F");
    pdf.setDrawColor(border[0], border[1], border[2]);
    pdf.line(marginX, headerY + 96, pageWidth - marginX, headerY + 96);

    const { logoBase64, textLogoBase64 } = getPdfLogoCache();
    if (logoBase64) {
      try {
        pdf.addImage(logoBase64, "PNG", marginX + 14, headerY + 14, 30, 30);
      } catch {}
    }
    if (textLogoBase64) {
      try {
        pdf.addImage(textLogoBase64, "PNG", pageWidth - marginX - 106, headerY + 18, 92, 28);
      } catch {}
    }

    pdf.setTextColor(subtle[0], subtle[1], subtle[2]);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("BOARD Franquias", marginX + 54, headerY + 20);

    pdf.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(17);
    pdf.text("Detalhamento DRE", marginX + 54, headerY + 40);

    pdf.setTextColor(accent[0], accent[1], accent[2]);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.text(entry.lineName, marginX + 54, headerY + 58);

    pdf.setTextColor(subtle[0], subtle[1], subtle[2]);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8.5);
    pdf.text("Total:", marginX + 16, headerY + 80);
    pdf.text("Regime:", marginX + 210, headerY + 80);
    pdf.text("Ano:", marginX + 360, headerY + 80);
    pdf.text("Meses:", marginX + 440, headerY + 80);
    pdf.text("Lojas:", marginX + 580, headerY + 80);

    pdf.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
    pdf.setFont("helvetica", "normal");
    pdf.text(formatCurrency(entry.total), marginX + 48, headerY + 80);
    pdf.text(entry.filters.regime === "cash" ? "Caixa" : "Competência", marginX + 252, headerY + 80);
    pdf.text(String(entry.filters.year), marginX + 388, headerY + 80);
    pdf.text(getMonthLabels(entry.filters.months), marginX + 480, headerY + 80);
    pdf.text(getSelectedStoreLabels(entry), marginX + 618, headerY + 80, { maxWidth: 120 });

    pdf.setTextColor(subtle[0], subtle[1], subtle[2]);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(`Gerado em ${formatDateTime(new Date())}`, pageWidth - marginX, headerY + 80, { align: "right" });

    if (pageNumber > 1) {
      pdf.text("Detalhamento DRE", pageWidth - marginX, headerY - 8, { align: "right" });
    }
  };

  drawHeader(1);

  autoTable(pdf, {
    startY: headerY + 114,
    margin: { left: marginX, right: marginX, top: 24, bottom: 30 },
    head: [["Data", "Loja", "Documento", "Fornecedor", "Origem", "Produto", "Status", "Valor"]],
    body: rows.map((row) => [row.data, row.loja, row.documento, row.fornecedor, row.origem, row.produto, row.status, row.valor]),
    theme: "grid",
    styles: {
      fontSize: 8.5,
      textColor: [30, 41, 59],
      cellPadding: { top: 6, right: 6, bottom: 6, left: 6 },
      lineColor: border,
      lineWidth: 0.6,
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: titleColor,
      fontStyle: "bold",
      halign: "center",
      lineColor: [203, 213, 225],
    },
    columnStyles: {
      0: { cellWidth: 58, halign: "center" },
      1: { cellWidth: 94 },
      2: { cellWidth: 180 },
      3: { cellWidth: 130 },
      4: { cellWidth: 104 },
      5: { cellWidth: 120 },
      6: { cellWidth: 68, halign: "center" },
      7: { cellWidth: 92, halign: "right", fontStyle: "bold" },
    },
    didDrawPage: (hookData) => {
      drawHeader(hookData.pageNumber);
    },
  });

  const totalPages = pdf.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(subtle[0], subtle[1], subtle[2]);
    pdf.text(`Página ${page} de ${totalPages}`, pageWidth - marginX, pageHeight - 16, { align: "right" });
  }

  pdf.save(`detalhamento-dre-${entry.lineName.toLowerCase().replace(/\s+/g, "-")}.pdf`);
}

function StatusBadge({ status }: { status?: string | null }) {
  const friendly = getFriendlyStatus(status);
  const toneClass =
    friendly.tone === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : friendly.tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-50 text-slate-600";

  const dotClass =
    friendly.tone === "success" ? "bg-emerald-500" : friendly.tone === "warning" ? "bg-amber-500" : "bg-slate-400";

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}>
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      {friendly.label}
    </span>
  );
}

export function DREAuditDrawer({ open, onOpenChange, entry }: DREAuditDrawerProps) {
  const recordCount = entry?.records.length || 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[96vw] border-l-slate-200 bg-white p-0 sm:max-w-6xl">
        <div className="border-b border-slate-200 bg-slate-50/80 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <SheetHeader className="space-y-2 text-left">
              <SheetTitle className="text-xl font-semibold text-slate-900">
                {entry?.lineName || "Detalhamento DRE"}
              </SheetTitle>
              <SheetDescription className="text-sm text-slate-600">
                Total apurado: <span className="font-semibold text-slate-900">{formatCurrency(entry?.total || 0)}</span>
              </SheetDescription>
            </SheetHeader>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-slate-200 bg-white text-slate-700"
                onClick={() => exportDetailsExcel(entry)}
                disabled={!entry}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Excel
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-slate-200 bg-white text-slate-700"
                onClick={() => {
                  void exportDetailsPdf(entry);
                }}
                disabled={!entry}
              >
                <FileText className="mr-2 h-4 w-4" />
                PDF
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
              Regime: {entry?.filters.regime === "cash" ? "Caixa" : "Competência"}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
              Ano: {entry?.filters.year || "-"}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
              Meses: {getMonthLabels(entry?.filters.months || [])}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
              Lojas: {getSelectedStoreLabels(entry)}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
              Registros: {recordCount}
            </Badge>
            <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
              Exportar: Excel e PDF
            </Badge>
          </div>
        </div>

        <ScrollArea className="h-[calc(100vh-158px)]">
          <div className="px-6 py-5">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-slate-50">
                  <TableRow className="border-slate-200 hover:bg-transparent">
                    <TableHead className="w-[88px]">Data</TableHead>
                    <TableHead className="min-w-[120px]">Loja</TableHead>
                    <TableHead className="min-w-[240px]">Documento</TableHead>
                    <TableHead className="min-w-[160px]">Fornecedor</TableHead>
                    <TableHead className="min-w-[140px]">Origem</TableHead>
                    <TableHead className="min-w-[160px]">Produto</TableHead>
                    <TableHead className="w-[110px] text-center">Status</TableHead>
                    <TableHead className="w-[140px] text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(entry?.records || []).map((record) => (
                    <TableRow key={record.id} className="border-slate-100 hover:bg-slate-50/60">
                      <TableCell className="py-3 text-sm text-slate-600">{formatShortDate(record.dateUsed)}</TableCell>
                      <TableCell className="py-3 text-sm text-slate-700">{record.storeName || record.storeId || "-"}</TableCell>
                      <TableCell className="py-3 text-sm font-medium text-slate-900">
                        {buildSmartDocumentLabel(record.documentNumber, record.description)}
                      </TableCell>
                      <TableCell className="py-3 text-sm text-slate-700">{record.supplierName || "—"}</TableCell>
                      <TableCell className="py-3 text-sm text-slate-700">
                        {record.friendlyOrigin || getFriendlyOriginLabel(record.origin)}
                      </TableCell>
                      <TableCell className="py-3 text-sm text-slate-700">
                        {record.categoryLabel || record.subgroupName || record.subgroupId || "—"}
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        <StatusBadge status={record.paymentStatus} />
                      </TableCell>
                      <TableCell className="py-3 text-right text-sm font-semibold tabular-nums text-slate-900">
                        {formatCurrency(record.value)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {recordCount === 0 ? (
                <div className="flex items-center justify-center gap-2 border-t border-slate-200 px-6 py-10 text-sm text-slate-500">
                  <Download className="h-4 w-4" />
                  Nenhum lançamento encontrado para esta linha.
                </div>
              ) : null}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
