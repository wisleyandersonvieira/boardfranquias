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
// Pattern A: NCM CST CFOP UN + 5..8 numbers (single-line layout, e.g. plain text exports)
const FISCAL_LINE_REGEX = new RegExp(
  `(\\d{8})\\s+(\\d{2,3})\\s+(\\d{4})\\s+([A-Z]{1,6})\\s+(${BR_NUMBER})\\s+(${BR_NUMBER})\\s+(${BR_NUMBER})(?:\\s+(${BR_NUMBER}))?(?:\\s+(${BR_NUMBER}))?(?:\\s+(${BR_NUMBER}))?(?:\\s+(${BR_NUMBER}))?(?:\\s+(${BR_NUMBER}))?`,
  "i",
);

// Pattern B: NCM CFOP UN + 8 numbers + CST (DANFE PDF layout where CST is rendered after the row)
// e.g. "21050090 6401 CX 20,0000 38,9637 779,27 779,27 54,55 25,33 7,00 3,25 010"
const FISCAL_LINE_REGEX_B = new RegExp(
  `(\\d{8})\\s+(\\d{4})\\s+([A-Z]{1,6})\\s+(${BR_NUMBER})\\s+(${BR_NUMBER})\\s+(${BR_NUMBER})\\s+(${BR_NUMBER})\\s+(${BR_NUMBER})\\s+(${BR_NUMBER})\\s+(${BR_NUMBER})\\s+(${BR_NUMBER})\\s+(\\d{3})`,
  "gi",
);

// Pattern C: TGA-style DANFE — 15-column table with DESCONTO between Valor Total and Base ICMS
// Layout: NCM CST CFOP UN QTD VU VT DESC BC VICMS VIPI ALIQ_ICMS ALIQ_IPI
// e.g. "48119019 000 5102 UN 30,00 3,7500 112,50 0,00 112,50 19,13 0,00 17,00 0,00"
const FISCAL_LINE_REGEX_C = new RegExp(
  `(\\d{8})\\s+(\\d{2,3})\\s+(\\d{4})\\s+([A-Z]{1,6})\\s+(${BR_NUMBER})\\s+(${BR_NUMBER})\\s+(${BR_NUMBER})\\s+(${BR_NUMBER})\\s+(${BR_NUMBER})\\s+(${BR_NUMBER})\\s+(${BR_NUMBER})\\s+(${BR_NUMBER})\\s+(${BR_NUMBER})`,
  "gi",
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
  let s = description;
  // Normalize whitespace inside tag tokens that may have been split by PDF line breaks.
  // e.g. "( /TRIB)", "(/T RIB)", "( Z)N ( /Z)" -> "(/TRIB)", "(Z)N(/Z)"
  s = s.replace(/\(\s*\/?\s*([A-Za-z]{1,6})\s*\)/g, (_m, tag) => `(${tag.startsWith("/") ? tag : (tag.length === 0 ? "" : tag)})`);
  // Re-add the slash where present. Easier alternative: explicit normalization below.
  s = description
    // collapse internal whitespace inside tag parentheses: ( /TRIB ) -> (/TRIB), (TR IB) -> (TRIB)
    .replace(/\(\s*([\/A-Za-z]{1,8})\s*\)/g, (_m, inner) => `(${inner.replace(/\s+/g, "")})`)
    .replace(/\(([^)]*)\)/g, (m, inner) => {
      // Inner may still contain spaces around the slash
      const cleaned = inner.replace(/\s+/g, "");
      return /^\/?(F|R|O|Z|Q|V|TRIB|B|E)$/i.test(cleaned) ? `(${cleaned})` : m;
    });
  return s
    .replace(/\((F|R|O|Z|Q|V|TRIB|B|E)\)[\s\S]{0,160}?\(\/\1\)/gi, " ")
    .replace(/\((?:\/)?(?:F|R|O|Z|Q|V|TRIB|B|E)\)/gi, " ")
    .replace(/\bSUB\s+TRIB\b[^\n]*?(?=$|\n|[A-Z]{3,})/gi, " ")
    .replace(/\bSUB\s+TRIB\b/gi, " ")
    .replace(/\bBase\s*:\s*[\d.,]+/gi, " ")
    .replace(/\bValor\s*:\s*[\d.,]+/gi, " ")
    .replace(/\b(?:EAN|GTIN|CEST|LOTE|FAB|VAL)\b\s*:?\s*[\w./-]+/gi, " ")
    .replace(/\b\d{8,14}\b/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/[-]\s*$/, "")
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
  const items: NfeItemImportado[] = [];
  // Combine all "DADOS DOS PRODUTOS" blocks (multi-page DANFE)
  const blocks = extractAllProdutosBlocks(text);

  for (const block of blocks) {
    items.push(...parseItensFromBlock(block));
  }

  // De-duplicate items that may repeat across page headers
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.codigo_fornecedor}|${item.quantidade}|${item.valor_total}|${item.descricao_limpa.slice(0, 40)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseItensFromBlock(block: string): NfeItemImportado[] {
  const items: NfeItemImportado[] = [];
  // Collapse all whitespace to single space for easier matching while preserving content
  const flat = block.replace(/\s+/g, " ").trim();

  // Strip the column-header preamble if present
  const cleaned = flat.replace(/^.*?(?:ALÍQUOTAS\s+ICMS\s+IPI|VALOR\s+IPI[^0-9]*)/i, "");

  // Try Pattern B first (DANFE PDF layout: NCM CFOP UN ... CST)
  let matches = [...cleaned.matchAll(FISCAL_LINE_REGEX_B)];
  if (matches.length > 0) {
    let cursor = 0;
    for (const match of matches) {
      const segment = cleaned.slice(cursor, match.index!).trim();
      cursor = match.index! + match[0].length;
      const codeMatch = segment.match(/^(\d{1,8})\s+([\s\S]+)$/);
      if (!codeMatch) continue;
      const code = codeMatch[1];
      const description = codeMatch[2];
      // Reorder Pattern B groups to match buildItem's expected layout (NCM, CST, CFOP, UN, qty, vu, vt, bc, vicms, vipi, aIcms, aIpi)
      const reordered = [
        match[0],
        match[1], // NCM
        match[12], // CST
        match[2], // CFOP
        match[3], // UN
        match[4], // QTD
        match[5], // VU
        match[6], // VT
        match[7], // BC
        match[8], // V_ICMS
        match[9], // V_IPI
        match[10], // ALIQ_ICMS
        match[11], // ALIQ_IPI
      ] as unknown as RegExpMatchArray;
      items.push(buildItem(code, description, reordered));
    }
    return items;
  }

  // Fallback: Pattern A (line-based)
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean).filter((l) => !isRepeatedProductHeader(l));
  let currentCode = "";
  let descriptionLines: string[] = [];
  for (const line of lines) {
    const fiscal = line.match(FISCAL_LINE_REGEX);
    if (fiscal && currentCode) {
      items.push(buildItem(currentCode, descriptionLines.join(" "), fiscal));
      currentCode = "";
      descriptionLines = [];
      continue;
    }
    const start = line.match(/^(\d{1,8})\s+(.+)$/);
    if (start && !line.match(/^\d{8}\s+\d{2,3}\s+\d{4}\s+/)) {
      if (currentCode && descriptionLines.length > 0) {
        descriptionLines.push(line);
      } else {
        currentCode = start[1];
        descriptionLines = [start[2]];
      }
      continue;
    }
    if (currentCode) descriptionLines.push(line);
  }
  return items;
}

function extractAllProdutosBlocks(text: string): string[] {
  const blocks: string[] = [];
  const startRegex = /DADOS\s+DOS\s+PRODUTOS\s*\/\s*SERVI[ÇC]OS/gi;
  const endRegex = /(?:C[ÁA]LCULO\s+DO\s+ISSQN|DADOS\s+ADICIONAIS|INFORMA[ÇC][ÕO]ES\s+COMPLEMENTARES|RESERVADO\s+AO\s+FISCO|---PAGINA---)/i;
  let m;
  while ((m = startRegex.exec(text)) !== null) {
    const sliced = text.slice(m.index + m[0].length);
    const endMatch = sliced.match(endRegex);
    blocks.push(endMatch ? sliced.slice(0, endMatch.index) : sliced);
  }
  return blocks.length > 0 ? blocks : [text];
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
