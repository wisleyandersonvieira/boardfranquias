import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { buildDreWorkbook, fixSheetPrOrder, makeExcelCompatible, type DreExportModel } from "./dreExcelExport.ts";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");
const JSZip = require("jszip");

const model: DreExportModel = {
  title: "DRE - Regime de Caixa",
  details: ["Estrutura: Caixa", "Lojas: Loja A, Loja B"],
  columns: [
    { period: "Setembro 2026", store: "Loja A" },
    { period: "Setembro 2026", store: "Loja B" },
    { period: "Outubro 2026", store: "Loja A" },
  ],
  rows: [
    { label: "Faturamento", type: "group", values: [1000, 2000, 1500] },
    { label: "Venda Dinheiro", type: "subgroup", values: [1000, 2000, 1500] },
    { label: "Estoque Inicial", type: "stock", values: [-300, -400, -500] },
    { label: "Saldo", type: "sum_line", values: [700, 1600, 1000] },
  ],
  fileName: "teste.xlsx",
};

const sheetPrChildren = (xml: string): string[] => {
  const inner = xml.match(/<sheetPr[^>]*>([\s\S]*?)<\/sheetPr>/)?.[1] ?? "";
  return [...inner.matchAll(/<(\w+)/g)].map((m) => m[1]);
};

test("fixSheetPrOrder coloca outlinePr antes de pageSetUpPr, sem perder atributos", () => {
  const xml =
    '<worksheet><sheetPr filterMode="0"><pageSetUpPr fitToPage="1"/><outlinePr summaryBelow="0" summaryRight="1"/><tabColor rgb="FF000000"/></sheetPr><dimension ref="A1"/></worksheet>';
  assert.equal(
    fixSheetPrOrder(xml),
    '<worksheet><sheetPr filterMode="0"><tabColor rgb="FF000000"/><outlinePr summaryBelow="0" summaryRight="1"/><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1"/></worksheet>',
  );
});

test("fixSheetPrOrder nao altera planilha ja correta ou sem sheetPr", () => {
  const ok = '<sheetPr><outlinePr summaryBelow="0"/><pageSetUpPr fitToPage="1"/></sheetPr>';
  assert.equal(fixSheetPrOrder(ok), ok);
  assert.equal(fixSheetPrOrder("<worksheet><sheetData/></worksheet>"), "<worksheet><sheetData/></worksheet>");
});

test("arquivo exportado sai com sheetPr na ordem exigida pelo Excel e com os mesmos dados", async () => {
  const original = await buildDreWorkbook(ExcelJS, model).xlsx.writeBuffer();
  const originalXml: string = await (await JSZip.loadAsync(original)).file("xl/worksheets/sheet1.xml").async("string");
  // Reproduz o defeito do exceljs que fazia o Excel recusar o arquivo.
  assert.deepEqual(sheetPrChildren(originalXml), ["pageSetUpPr", "outlinePr"]);

  const fixed = await makeExcelCompatible(original, JSZip);
  const fixedXml: string = await (await JSZip.loadAsync(fixed)).file("xl/worksheets/sheet1.xml").async("string");
  assert.deepEqual(sheetPrChildren(fixedXml), ["outlinePr", "pageSetUpPr"]);
  // Fora do sheetPr, nada muda.
  assert.equal(fixedXml.replace(/<sheetPr[\s\S]*?<\/sheetPr>/, ""), originalXml.replace(/<sheetPr[\s\S]*?<\/sheetPr>/, ""));

  // O arquivo corrigido continua legivel e com os valores.
  const reread = new ExcelJS.Workbook();
  await reread.xlsx.load(fixed);
  const sheet = reread.getWorksheet("DRE");
  const values = [];
  sheet.eachRow((row: { values: unknown[] }) => values.push(row.values.slice(1)));
  assert.ok(values.some((row) => row[0] === "Saldo" && row[1] === 700 && row[3] === 1000));
});
