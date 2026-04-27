export interface NfeDuplicata {
  parcela: string;
  vencimento: string;
  valor: number;
  valorOriginal: string;
}

export interface NfeCabecalho {
  numero_nfe?: string;
  serie?: string;
  chave_acesso?: string;
  fornecedor?: string;
  cnpj_fornecedor?: string;
  destinatario?: string;
  data_emissao?: string;
  valor_total_nota?: number;
  valor_total_produtos?: number;
  duplicatas: NfeDuplicata[];
}

export interface NfeItemImportado {
  codigo_fornecedor: string;
  descricao_original_pdf: string;
  descricao_limpa: string;
  ncm: string;
  cst: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  base_icms?: number;
  valor_icms?: number;
  valor_ipi?: number;
  aliquota_icms?: number;
  aliquota_ipi?: number;
}

export interface NfeParseResult {
  cabecalho: NfeCabecalho;
  itens: NfeItemImportado[];
  textoNormalizado: string;
}

const BR_NUMBER = "\\d{1,3}(?:\\.\\d{3})*,\\d{2,4}|\\d+,\\d{2,4}";
const FISCAL_LINE_REGEX = new RegExp(
  `^(\\d{8})\\s+(\\d{2,3})\\s+(\\d{4})\\s+([A-Z]{1,6})\\s+(${BR_NUMBER})\\s+(${BR_NUMBER})\\s+(${BR_NUMBER})(?:\\s+(${BR_NUMBER}))?(?:\\s+(${BR_NUMBER}))?(?:\\s+(${BR_NUMBER}))?(?:\\s+(${BR_NUMBER}))?(?:\\s+(${BR_NUMBER}))?.*$`,
  "i",
);

export function parseBrazilianNumber(valor?: string | number | null): number {
  if (typeof valor === "number") return valor;
  if (!valor) return 0;
  const normalized = valor
    .toString()
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function cleanNfeItemDescription(description: string): string {
  return description
    .replace(/\((F|R|O|Z|Q|V|TRIB|B|E)\)[\s\S]{0,80}?\(\/\1\)/gi, " ")
    .replace(/\((?:\/)?(?:F|R|O|Z|Q|V|TRIB|B|E)\)/gi, " ")
    .replace(/\bSUB\s+TRIB\b/gi, " ")
    .replace(/\bBase\s*:\s*[\d.,]+/gi, " ")
    .replace(/\bValor\s*:\s*[\d.,]+/gi, " ")
    .replace(/\b(?:EAN|GTIN|CEST|LOTE|FAB|VAL)\b\s*:?\s*[\w./-]+/gi, " ")
    .replace(/\b\d{8,14}\b/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

export function parseNfePdf(textoCompleto: string): NfeParseResult {
  const textoNormalizado = normalizePdfText(textoCompleto);
  return {
    cabecalho: parseCabecalho(textoNormalizado),
    itens: parseItens(textoNormalizado),
    textoNormalizado,
  };
}

function normalizePdfText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseCabecalho(text: string): NfeCabecalho {
  const chave = firstMatch(text, /(?:CHAVE\s+DE\s+ACESSO|Chave\s+de\s+acesso)\s*[:\n ]+((?:\d[\s.]*){44})/i)
    ?.replace(/\D/g, "");
  const cnpjs = [...text.matchAll(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g)].map((m) => m[0]);
  const numeroNfe =
    firstMatch(text, /NF-?e\s*(?:N[º°o.]*)?\s*(\d{1,12})/i) ||
    firstMatch(text, /N[º°]\s*(\d{1,12})/i);
  const serie = firstMatch(text, /S[ÉE]RIE\s*(?:[:\n ]+)?(\d{1,4})/i);

  return {
    numero_nfe: numeroNfe,
    serie,
    chave_acesso: chave,
    fornecedor: parseFornecedor(text),
    cnpj_fornecedor: cnpjs[0],
    destinatario: parseDestinatario(text),
    data_emissao: firstMatch(text, /(?:DATA\s+DE\s+EMISS[ÃA]O|EMISS[ÃA]O)\s*[:\n ]+(\d{2}\/\d{2}\/\d{4})/i),
    valor_total_nota: parseTotalNota(text),
    valor_total_produtos: parseTotalProdutos(text),
    duplicatas: parseDuplicatas(text),
  };
}

function parseItens(text: string): NfeItemImportado[] {
  const block = extractProdutosBlock(text);
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isRepeatedProductHeader(line));

  const items: NfeItemImportado[] = [];
  let currentCode = "";
  let descriptionLines: string[] = [];

  for (const line of lines) {
    const start = line.match(/^(\d{1,8})\s+(.+)$/);
    const fiscalLine = line.match(FISCAL_LINE_REGEX);

    if (fiscalLine && currentCode) {
      items.push(buildItem(currentCode, descriptionLines.join(" "), fiscalLine));
      currentCode = "";
      descriptionLines = [];
      continue;
    }

    if (start && !line.match(/^\d{8}\s+\d{2,3}\s+\d{4}\s+/)) {
      if (currentCode && descriptionLines.length > 0) {
        descriptionLines.push(line);
      } else {
        currentCode = start[1];
        descriptionLines = [start[2]];
      }
      continue;
    }

    if (currentCode) {
      descriptionLines.push(line);
    }
  }

  return items;
}

function extractProdutosBlock(text: string): string {
  const start = text.search(/DADOS\s+DOS\s+PRODUTOS\s*\/\s*SERVI[ÇC]OS/i);
  if (start === -1) return text;
  const sliced = text.slice(start);
  const end = sliced.search(/\n\s*(?:C[ÁA]LCULO\s+DO\s+ISSQN|DADOS\s+ADICIONAIS|INFORMA[ÇC][ÕO]ES\s+COMPLEMENTARES|RESERVADO\s+AO\s+FISCO)/i);
  return end > 0 ? sliced.slice(0, end) : sliced;
}

function isRepeatedProductHeader(line: string): boolean {
  return /COD\.?\s*PROD|DESCRI[ÇC][ÃA]O|NCM\/SH|VALOR\s+UNIT/i.test(line);
}

function buildItem(code: string, rawDescription: string, match: RegExpMatchArray): NfeItemImportado {
  return {
    codigo_fornecedor: code,
    descricao_original_pdf: rawDescription.trim(),
    descricao_limpa: cleanNfeItemDescription(rawDescription),
    ncm: match[1],
    cst: match[2],
    cfop: match[3],
    unidade: match[4].toUpperCase(),
    quantidade: parseBrazilianNumber(match[5]),
    valor_unitario: parseBrazilianNumber(match[6]),
    valor_total: parseBrazilianNumber(match[7]),
    base_icms: parseOptionalNumber(match[8]),
    valor_icms: parseOptionalNumber(match[9]),
    valor_ipi: parseOptionalNumber(match[10]),
    aliquota_icms: parseOptionalNumber(match[11]),
    aliquota_ipi: parseOptionalNumber(match[12]),
  };
}

function parseOptionalNumber(value?: string): number | undefined {
  return value ? parseBrazilianNumber(value) : undefined;
}

function parseFornecedor(text: string): string | undefined {
  const beforeDestinatario = text.split(/DESTINAT[ÁA]RIO/i)[0] || text;
  return (
    firstMatch(beforeDestinatario, /(?:NOME\s*\/\s*RAZ[ÃA]O\s+SOCIAL|RAZ[ÃA]O\s+SOCIAL)\s*\n?([A-Z0-9 .&/-]{8,})/i) ||
    firstMatch(beforeDestinatario, /\n([A-Z0-9 .&/-]{8,}LTDA)\b/i)
  )?.trim();
}

function parseDestinatario(text: string): string | undefined {
  const afterDestinatario = text.split(/DESTINAT[ÁA]RIO/i)[1] || "";
  return firstMatch(afterDestinatario, /(?:NOME\s*\/\s*RAZ[ÃA]O\s+SOCIAL)?\s*\n?([A-Z0-9 .&/-]{8,}LTDA)\b/i)?.trim();
}

function parseTotalNota(text: string): number | undefined {
  const value = firstMatch(text, /VALOR\s+TOTAL\s+DA\s+NOTA\s*(?:R\$)?\s*([\d.]+,\d{2})/i);
  return value ? parseBrazilianNumber(value) : undefined;
}

function parseTotalProdutos(text: string): number | undefined {
  const value = firstMatch(text, /VALOR\s+TOTAL\s+DOS\s+PRODUTOS\s*(?:R\$)?\s*([\d.]+,\d{2})/i);
  return value ? parseBrazilianNumber(value) : undefined;
}

function parseDuplicatas(text: string): NfeDuplicata[] {
  const block = firstMatch(text, /FATURA\s*\/\s*DUPLICATA([\s\S]{0,900}?)(?:C[ÁA]LCULO|DADOS\s+DOS\s+PRODUTOS|TRANSPORTADOR)/i) || text;
  return [...block.matchAll(/(\d{3})\s+Ve\.?\s*(\d{2}\/\d{2}\/\d{4})\s+R?\$?\s*([\d.]+,\d{2})/gi)].map((match) => ({
    parcela: match[1],
    vencimento: match[2],
    valor: parseBrazilianNumber(match[3]),
    valorOriginal: match[3],
  }));
}

function firstMatch(text: string, regex: RegExp): string | undefined {
  return text.match(regex)?.[1]?.trim();
}
