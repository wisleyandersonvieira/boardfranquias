import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

import type { DREApuracaoResult, DREViewMode } from "@/modules/dre-v2/types";
import { buildCsv, formatCurrency, formatPercent, getColumnRevenue } from "@/modules/dre-v2/utils";

function buildRows(result: DREApuracaoResult, mode: DREViewMode, showPercentages: boolean): string[][] {
  const visibleIds = new Set(result.visibleLineIdsByMode[mode]);
  const head = ["Descricao", ...result.columns.map((column) => column.label)];
  const rows = [head];

  result.lineResults
    .filter((line) => visibleIds.has(line.item.id))
    .forEach((line) => {
      rows.push([
        `${"  ".repeat(line.item.level)}${line.item.name}`,
        ...result.columns.map((column) => {
          const value = line.valuesByColumn[column.id] || 0;
          if (!showPercentages) {
            return formatCurrency(value);
          }

          const revenue = getColumnRevenue(result, column.id);
          return `${formatCurrency(value)} (${formatPercent(revenue ? value / revenue : null)})`;
        }),
      ]);
    });

  return rows;
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
  const csv = buildCsv(buildRows(result, mode, showPercentages));
  triggerDownload(`dre-${result.filters.regime}-${mode}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8;" }));
}

export function exportDreExcel(result: DREApuracaoResult, mode: DREViewMode, showPercentages: boolean): void {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(buildRows(result, mode, showPercentages));
  XLSX.utils.book_append_sheet(workbook, sheet, "DRE");
  XLSX.writeFile(workbook, `dre-${result.filters.regime}-${mode}.xlsx`);
}

export function exportDrePdf(result: DREApuracaoResult, mode: DREViewMode, showPercentages: boolean): void {
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  pdf.setFontSize(16);
  pdf.text(`DRE ${result.filters.regime === "cash" ? "Caixa" : "Competencia"}`, 40, 40);
  pdf.setFontSize(10);
  pdf.text(`Estrutura: ${result.structure.name}`, 40, 58);

  const rows = buildRows(result, mode, showPercentages);
  autoTable(pdf, {
    startY: 72,
    head: [rows[0]],
    body: rows.slice(1),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [15, 23, 42] },
    theme: "grid",
  });

  pdf.save(`dre-${result.filters.regime}-${mode}.pdf`);
}
