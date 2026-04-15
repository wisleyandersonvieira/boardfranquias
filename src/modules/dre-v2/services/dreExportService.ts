import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

import type { DREApuracaoResult, DREExportContext, DREValueDisplayMode, DREViewMode } from "@/modules/dre-v2/types";
import { getPdfLogoCache, warmPdfLogoCache } from "@/utils/pdfHeader";
import { buildCsv, formatCurrency, formatDateTime, formatPercent, formatPeriodLabel, getColumnRevenue } from "@/modules/dre-v2/utils";

type ExportRow = {
  lineId: string;
  itemType: string;
  level: number;
  name: string;
  values: string[];
  total: string;
  isZero: boolean;
};

function formatCellValue(
  value: number,
  revenue: number,
  valueDisplayMode: DREValueDisplayMode,
): string {
  if (valueDisplayMode === "percent") {
    return formatPercent(revenue ? value / revenue : null);
  }

  if (valueDisplayMode === "value") {
    return formatCurrency(value);
  }

  return `${formatCurrency(value)}\n${formatPercent(revenue ? value / revenue : null)}`;
}

function buildRows(
  result: DREApuracaoResult,
  mode: DREViewMode,
  valueDisplayMode: DREValueDisplayMode,
  hideZeroLines = false,
): string[][] {
  const visibleIds = new Set(result.visibleLineIdsByMode[mode]);
  const head = ["Descricao", ...result.columns.map((column) => column.label)];
  const rows = [head];

  result.lineResults
    .filter((line) => visibleIds.has(line.item.id))
    .filter((line) => !hideZeroLines || result.columns.some((column) => (line.valuesByColumn[column.id] || 0) !== 0) || line.total !== 0)
    .forEach((line) => {
      rows.push([
        `${"  ".repeat(line.item.level)}${line.item.name}`,
        ...result.columns.map((column) => {
          const value = line.valuesByColumn[column.id] || 0;
          const revenue = getColumnRevenue(result, column.id);
          return formatCellValue(value, revenue, valueDisplayMode);
        }),
      ]);
    });

  return rows;
}

function buildStructuredRows(
  result: DREApuracaoResult,
  mode: DREViewMode,
  valueDisplayMode: DREValueDisplayMode,
  hideZeroLines = false,
): ExportRow[] {
  const visibleIds = new Set(result.visibleLineIdsByMode[mode]);

  return result.lineResults
    .filter((line) => visibleIds.has(line.item.id))
    .map((line) => {
      const isZero = result.columns.every((column) => (line.valuesByColumn[column.id] || 0) === 0) && line.total === 0;
      return {
        lineId: line.item.id,
        itemType: line.item.itemType,
        level: line.item.level,
        name: line.item.name,
        values: result.columns.map((column) => {
          const value = line.valuesByColumn[column.id] || 0;
          const revenue = getColumnRevenue(result, column.id);
          return formatCellValue(value, revenue, valueDisplayMode);
        }),
        total: formatCellValue(line.total, result.lineResults[0]?.total || 0, valueDisplayMode === "percent" ? "percent" : "value"),
        isZero,
      };
    })
    .filter((row) => !hideZeroLines || !row.isZero);
}

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportDreCsv(result: DREApuracaoResult, mode: DREViewMode, showPercentages: boolean): void {
  const csv = buildCsv(buildRows(result, mode, showPercentages ? "value_percent" : "value"));
  triggerDownload(`dre-${result.filters.regime}-${mode}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8;" }));
}

export function exportDreExcel(result: DREApuracaoResult, mode: DREViewMode, showPercentages: boolean): void {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(buildRows(result, mode, showPercentages ? "value_percent" : "value"));
  XLSX.utils.book_append_sheet(workbook, sheet, "DRE");
  XLSX.writeFile(workbook, `dre-${result.filters.regime}-${mode}.xlsx`);
}

function buildMetadataRows(result: DREApuracaoResult, context: DREExportContext): Array<[string, string]> {
  return [
    ["Regime", result.filters.regime === "cash" ? "Regime de Caixa" : "Regime de Competência"],
    ["Estrutura", result.structure.name],
    ["Período", formatPeriodLabel(result.filters.year, result.filters.months)],
    ["Lojas", context.selectedStoreNames.length > 0 ? context.selectedStoreNames.join(", ") : "Todas"],
    ["Agrupamento", context.groupModeLabel],
    ["Exibição", context.valueDisplayMode === "value" ? "Apenas valor" : context.valueDisplayMode === "percent" ? "Apenas %" : "Valor e %"],
    ["Gerado em", formatDateTime(context.generatedAt)],
    ["Usuário", context.generatedBy || "Não identificado"],
  ];
}

function drawExecutiveHeader(pdf: jsPDF, result: DREApuracaoResult, context: DREExportContext, pageNumber: number): number {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const marginX = 34;
  const topY = 28;
  const headerHeight = 108;
  const subtle = [100, 116, 139];
  const line = [226, 232, 240];
  const titleColor = [15, 23, 42];
  const accent = [30, 64, 175];

  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(marginX, topY, pageWidth - marginX * 2, headerHeight, 10, 10, "F");
  pdf.setDrawColor(line[0], line[1], line[2]);
  pdf.setLineWidth(1);
  pdf.line(marginX, topY + headerHeight, pageWidth - marginX, topY + headerHeight);

  const { logoBase64, textLogoBase64 } = getPdfLogoCache();
  if (context.showLogo !== false && logoBase64) {
    try {
      pdf.addImage(logoBase64, "PNG", marginX + 14, topY + 14, 30, 30);
    } catch {}
  }
  if (context.showLogo !== false && textLogoBase64) {
    try {
      pdf.addImage(textLogoBase64, "PNG", pageWidth - marginX - 106, topY + 18, 92, 28);
    } catch {}
  }

  pdf.setTextColor(subtle[0], subtle[1], subtle[2]);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(context.systemName, marginX + 54, topY + 20);

  pdf.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(19);
  pdf.text(context.reportTitle, marginX + 54, topY + 42);

  pdf.setTextColor(accent[0], accent[1], accent[2]);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(result.filters.regime === "cash" ? "Regime de Caixa" : "Regime de Competência", marginX + 54, topY + 60);

  const metadataRows = buildMetadataRows(result, context);
  const leftColumn = metadataRows.slice(0, 4);
  const rightColumn = metadataRows.slice(4);
  let metaY = topY + 80;

  pdf.setFontSize(8.5);
  leftColumn.forEach(([label, value], index) => {
    const y = metaY + index * 13;
    pdf.setTextColor(subtle[0], subtle[1], subtle[2]);
    pdf.setFont("helvetica", "bold");
    pdf.text(`${label}:`, marginX + 16, y);
    pdf.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
    pdf.setFont("helvetica", "normal");
    pdf.text(String(value), marginX + 62, y);
  });
  rightColumn.forEach(([label, value], index) => {
    const y = metaY + index * 13;
    pdf.setTextColor(subtle[0], subtle[1], subtle[2]);
    pdf.setFont("helvetica", "bold");
    pdf.text(`${label}:`, marginX + 330, y);
    pdf.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
    pdf.setFont("helvetica", "normal");
    pdf.text(String(value), marginX + 392, y);
  });

  if (pageNumber > 1) {
    pdf.setTextColor(subtle[0], subtle[1], subtle[2]);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(context.reportTitle, pageWidth - marginX, topY - 6, { align: "right" });
  }

  return topY + headerHeight + 18;
}

function drawFooter(pdf: jsPDF, context: DREExportContext): void {
  const pages = pdf.getNumberOfPages();
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();

  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text(context.systemName, 34, height - 18);
    pdf.text(formatDateTime(context.generatedAt), width / 2, height - 18, { align: "center" });
    pdf.text(`Página ${page} de ${pages}`, width - 34, height - 18, { align: "right" });
  }
}

export async function exportDrePdf(
  result: DREApuracaoResult,
  mode: DREViewMode,
  context: DREExportContext,
): Promise<void> {
  await warmPdfLogoCache();
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const rows = buildStructuredRows(result, mode, context.valueDisplayMode, context.hideZeroLines);
  const startY = drawExecutiveHeader(pdf, result, context, 1);

  autoTable(pdf, {
    startY,
    margin: { left: 34, right: 34, top: 24, bottom: 28 },
    head: [[
      "Descrição",
      ...result.columns.map((column) => column.label),
      "Total",
    ]],
    body: rows.map((row) => [row.name, ...row.values, row.total]),
    theme: "grid",
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 6, right: 6, bottom: 6, left: 6 },
      lineColor: [226, 232, 240],
      lineWidth: 0.6,
      textColor: [30, 41, 59],
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: "bold",
      halign: "center",
      valign: "middle",
      lineColor: [203, 213, 225],
    },
    columnStyles: {
      0: { cellWidth: 220, halign: "left" },
      [result.columns.length + 1]: { cellWidth: 118, halign: "right", fontStyle: "bold" },
    },
    willDrawCell: (data) => {
      if (data.section !== "body") {
        return;
      }

      const row = rows[data.row.index];
      if (!row) {
        return;
      }

      if (row.itemType === "group") {
        data.cell.styles.fillColor = [248, 250, 252];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 9.5;
      }

      if (row.itemType === "subgroup") {
        if (data.column.index === 0) {
          data.cell.text = [`   ${row.name}`];
        }
      }

      if (row.itemType === "sum_line") {
        data.cell.styles.fillColor = [226, 232, 240];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.lineWidth = 0.9;
      }

      if (data.column.index > 0) {
        data.cell.styles.halign = "right";
      }
    },
    didDrawPage: (hookData) => {
      drawExecutiveHeader(pdf, result, context, hookData.pageNumber);
    },
  });

  drawFooter(pdf, context);
  pdf.save(`dre-${result.filters.regime}-${mode}.pdf`);
}
