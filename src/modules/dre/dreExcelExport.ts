/**
 * Exportacao do DRE para Excel com formatacao (cores por tipo de linha,
 * totais, congelamento de cabecalho, agrupamento recolhivel e impressao).
 *
 * Recebe um modelo neutro montado pela tela (DREView); nao consulta nada.
 * O exceljs e carregado sob demanda para nao pesar no carregamento do sistema.
 */

export type DreExportRowType = "group" | "subgroup" | "sum_line" | "stock";

export interface DreExportColumn {
  /** Ex.: "Outubro 2026" */
  period: string;
  /** Nome da loja; omitido quando as lojas estao agrupadas. */
  store?: string;
}

export interface DreExportRow {
  label: string;
  type: DreExportRowType;
  /** Um valor por coluna, na mesma ordem de `columns`. */
  values: number[];
}

export interface DreExportModel {
  /** Ex.: "DRE - Regime de Caixa" */
  title: string;
  /** Linhas de contexto abaixo do titulo (estrutura, lojas, periodo...). */
  details: string[];
  columns: DreExportColumn[];
  rows: DreExportRow[];
  fileName: string;
}

// Paleta: indigo do sistema para cabecalho e totais de grupo; tom escuro para
// as linhas de resultado, que sao os totais mais importantes do demonstrativo.
const COLOR = {
  headerFill: "FF4F46E5",
  headerText: "FFFFFFFF",
  groupFill: "FFE0E7FF",
  groupText: "FF1E1B4B",
  resultFill: "FF1E1B4B",
  resultText: "FFFFFFFF",
  totalColumnFill: "FFF5F5F4",
  text: "FF171717",
  muted: "FF525252",
  border: "FFD4D4D4",
  negative: "FFDC2626",
  negativeOnDark: "FFFCA5A5",
} as const;

const FONT = "Arial";
const NUMBER_FORMAT = '#,##0.00;-#,##0.00;"-"';

const round2 = (value: number): number => Math.round((Number(value) || 0) * 100) / 100;

const columnLetter = (index: number): string => {
  let letter = "";
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) {
    letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter;
  }
  return letter;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcelModule = any;

export function buildDreWorkbook(ExcelJS: ExcelModule, model: DreExportModel) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  const hasStoreRow = model.columns.some((column) => !!column.store);
  const valueCount = model.columns.length;
  const showTotal = valueCount > 1;
  const lastColumn = 1 + valueCount + (showTotal ? 1 : 0);
  const totalColumn = showTotal ? lastColumn : 0;

  const titleRows = 1 + model.details.length;
  const headerRow = titleRows + 2; // uma linha em branco entre o contexto e a tabela
  const firstDataRow = headerRow + (hasStoreRow ? 2 : 1);

  const sheet = workbook.addWorksheet("DRE", {
    views: [{ state: "frozen", xSplit: 1, ySplit: firstDataRow - 1, showGridLines: false }],
    properties: { outlineLevelRow: 1 },
    pageSetup: {
      orientation: "landscape",
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: `${headerRow}:${firstDataRow - 1}`,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });
  // Totais de grupo ficam ACIMA dos itens, como na tela.
  sheet.properties.outlineProperties = { summaryBelow: false, summaryRight: true };

  // ---------------- Titulo e contexto
  sheet.getCell(1, 1).value = model.title;
  sheet.getCell(1, 1).font = { name: FONT, size: 14, bold: true, color: { argb: COLOR.groupText } };
  sheet.getRow(1).height = 22;
  model.details.forEach((detail, index) => {
    const cell = sheet.getCell(2 + index, 1);
    cell.value = detail;
    cell.font = { name: FONT, size: 9, color: { argb: COLOR.muted } };
  });

  // ---------------- Cabecalho
  const styleHeader = (rowNumber: number) => {
    const row = sheet.getRow(rowNumber);
    row.height = 20;
    for (let c = 1; c <= lastColumn; c++) {
      const cell = row.getCell(c);
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: COLOR.headerText } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.headerFill } };
      cell.alignment = { horizontal: c === 1 ? "left" : "center", vertical: "middle", wrapText: true };
      cell.border = { right: { style: "thin", color: { argb: "FF6366F1" } } };
    }
  };

  sheet.getCell(headerRow, 1).value = "Descrição";
  model.columns.forEach((column, index) => {
    sheet.getCell(headerRow, 2 + index).value = column.period;
    if (hasStoreRow) sheet.getCell(headerRow + 1, 2 + index).value = column.store ?? "";
  });
  if (showTotal) sheet.getCell(headerRow, totalColumn).value = "Total";
  styleHeader(headerRow);
  if (hasStoreRow) {
    styleHeader(headerRow + 1);
    sheet.mergeCells(headerRow, 1, headerRow + 1, 1);
    if (showTotal) sheet.mergeCells(headerRow, totalColumn, headerRow + 1, totalColumn);
    // Um unico titulo de mes sobre as lojas daquele mes.
    let start = 0;
    while (start < valueCount) {
      let end = start;
      while (end + 1 < valueCount && model.columns[end + 1].period === model.columns[start].period) end++;
      if (end > start) sheet.mergeCells(headerRow, 2 + start, headerRow, 2 + end);
      start = end + 1;
    }
  }

  // ---------------- Linhas
  model.rows.forEach((item, index) => {
    const rowNumber = firstDataRow + index;
    const row = sheet.getRow(rowNumber);
    const isGroup = item.type === "group";
    const isResult = item.type === "sum_line";
    const isDetail = !isGroup && !isResult;

    const fill = isResult ? COLOR.resultFill : isGroup ? COLOR.groupFill : undefined;
    const textColor = isResult ? COLOR.resultText : isGroup ? COLOR.groupText : COLOR.text;
    const negativeColor = isResult ? COLOR.negativeOnDark : COLOR.negative;
    const bold = isGroup || isResult;

    row.height = isResult ? 20 : 16;
    if (isDetail) row.outlineLevel = 1;

    const label = row.getCell(1);
    label.value = item.label;
    label.font = { name: FONT, size: 10, bold, color: { argb: textColor } };
    label.alignment = { horizontal: "left", vertical: "middle", indent: isDetail ? 2 : 0 };

    const paint = (cell: ExcelModule, value: number | null) => {
      cell.numFmt = NUMBER_FORMAT;
      cell.alignment = { horizontal: "right", vertical: "middle", indent: 1 };
      cell.font = {
        name: FONT,
        size: 10,
        bold,
        color: { argb: value !== null && value < 0 ? negativeColor : textColor },
      };
    };

    const values = item.values.map(round2);
    values.forEach((value, valueIndex) => {
      const cell = row.getCell(2 + valueIndex);
      cell.value = value;
      paint(cell, value);
    });

    if (showTotal) {
      const cell = row.getCell(totalColumn);
      if (item.type === "stock") {
        // Somar estoque de varios meses nao tem significado.
        paint(cell, null);
      } else {
        const total = round2(values.reduce((sum, value) => sum + value, 0));
        cell.value = {
          formula: `SUM(${columnLetter(2)}${rowNumber}:${columnLetter(1 + valueCount)}${rowNumber})`,
          result: total,
        };
        paint(cell, total);
        cell.font = { ...cell.font, bold: true };
      }
      if (!fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR.totalColumnFill } };
      cell.border = { left: { style: "thin", color: { argb: COLOR.border } } };
    }

    for (let c = 1; c <= lastColumn; c++) {
      const cell = row.getCell(c);
      if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
      cell.border = {
        ...(cell.border ?? {}),
        bottom: { style: isResult ? "medium" : "hair", color: { argb: isResult ? COLOR.resultFill : COLOR.border } },
        ...(isResult ? { top: { style: "thin", color: { argb: COLOR.resultFill } } } : {}),
      };
    }
  });

  // ---------------- Larguras
  const longestLabel = model.rows.reduce((max, item) => Math.max(max, item.label.length), 12);
  sheet.getColumn(1).width = Math.min(48, Math.max(30, longestLabel + 6));
  for (let c = 2; c <= lastColumn; c++) sheet.getColumn(c).width = 17;
  if (showTotal) sheet.getColumn(totalColumn).width = 19;

  return workbook;
}

/** Monta o arquivo e dispara o download no navegador. */
export async function downloadDreExcel(model: DreExportModel): Promise<void> {
  const module = await import("exceljs");
  const ExcelJS = (module as ExcelModule).default ?? module;
  const workbook = buildDreWorkbook(ExcelJS, model);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = model.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
