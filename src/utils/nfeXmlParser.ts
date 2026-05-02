import type { NfeCabecalho, NfeDuplicata, NfeItemImportado, NfeParseResult } from "./nfeDanfeParser";
import { cleanNfeItemDescription } from "./nfeDanfeParser";

/**
 * Parses a NF-e (modelo 55) XML following the SEFAZ procNFe / nfeProc / NFe schema.
 * Works in browser (uses DOMParser).
 */
export function parseNfeXml(xml: string): NfeParseResult {
  const cleaned = stripBom(xml);
  const doc = new DOMParser().parseFromString(cleaned, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("XML da NF-e inválido ou corrompido.");
  }

  const infNFe = doc.querySelector("infNFe");
  if (!infNFe) {
    throw new Error("XML não contém o nó infNFe — não é uma NF-e válida.");
  }

  const ide = infNFe.querySelector("ide");
  const emit = infNFe.querySelector("emit");
  const dest = infNFe.querySelector("dest");
  const total = infNFe.querySelector("total ICMSTot");
  const cobr = infNFe.querySelector("cobr");

  // Chave de acesso fica no atributo Id="NFe<chave>"
  const idAttr = infNFe.getAttribute("Id") || "";
  const chave = idAttr.replace(/^NFe/i, "").replace(/\D/g, "") || undefined;

  const dEmiRaw = text(ide, "dhEmi") || text(ide, "dEmi");
  const dataEmissao = formatDateBr(dEmiRaw);

  const cabecalho: NfeCabecalho = {
    numero_nfe: stripLeadingZeros(text(ide, "nNF")),
    serie: text(ide, "serie") || undefined,
    chave_acesso: chave,
    fornecedor: text(emit, "xNome") || undefined,
    cnpj_fornecedor: formatCnpjCpf(text(emit, "CNPJ") || text(emit, "CPF")),
    destinatario: text(dest, "xNome") || undefined,
    data_emissao: dataEmissao,
    valor_total_nota: numberOrUndef(text(total, "vNF")),
    valor_total_produtos: numberOrUndef(text(total, "vProd")),
    duplicatas: parseDuplicatas(cobr),
  };

  const itens: NfeItemImportado[] = Array.from(infNFe.querySelectorAll("det")).map((det) => parseItem(det));

  return { cabecalho, itens, textoNormalizado: cleaned };
}

function parseItem(det: Element): NfeItemImportado {
  const prod = det.querySelector("prod");
  const imposto = det.querySelector("imposto");

  // ICMS pode estar em qualquer subnó (ICMS00, ICMS10, ICMSSN102, etc.)
  const icmsNode = imposto?.querySelector("ICMS")?.firstElementChild as Element | null;
  const ipiTrib = imposto?.querySelector("IPI IPITrib") as Element | null;

  const cstIcms = text(icmsNode, "CST") || text(icmsNode, "CSOSN") || "";

  const descricao = text(prod, "xProd") || "";

  return {
    codigo_fornecedor: text(prod, "cProd") || "",
    descricao_original_pdf: descricao,
    descricao_limpa: cleanNfeItemDescription(descricao),
    ncm: text(prod, "NCM") || "",
    cst: cstIcms,
    cfop: text(prod, "CFOP") || "",
    unidade: (text(prod, "uCom") || "").toUpperCase(),
    quantidade: numberOrZero(text(prod, "qCom")),
    valor_unitario: numberOrZero(text(prod, "vUnCom")),
    valor_total: numberOrZero(text(prod, "vProd")),
    base_icms: numberOrUndef(text(icmsNode, "vBC")),
    valor_icms: numberOrUndef(text(icmsNode, "vICMS")),
    valor_ipi: numberOrUndef(text(ipiTrib, "vIPI")),
    aliquota_icms: numberOrUndef(text(icmsNode, "pICMS")),
    aliquota_ipi: numberOrUndef(text(ipiTrib, "pIPI")),
  };
}

function parseDuplicatas(cobr: Element | null): NfeDuplicata[] {
  if (!cobr) return [];
  return Array.from(cobr.querySelectorAll("dup")).map((dup, idx) => {
    const valor = numberOrZero(text(dup, "vDup"));
    return {
      parcela: (text(dup, "nDup") || String(idx + 1).padStart(3, "0")).padStart(3, "0"),
      vencimento: formatDateBr(text(dup, "dVenc")) || "",
      valor,
      valorOriginal: valor.toFixed(2).replace(".", ","),
    };
  });
}

// ----------------- helpers -----------------

function text(el: Element | null | undefined, tag: string): string | undefined {
  if (!el) return undefined;
  const node = el.querySelector(tag);
  return node?.textContent?.trim() || undefined;
}

function numberOrZero(v?: string | null): number {
  if (!v) return 0;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function numberOrUndef(v?: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

function stripLeadingZeros(v?: string | null): string | undefined {
  if (!v) return undefined;
  const stripped = v.replace(/^0+/, "");
  return stripped || v;
}

function formatCnpjCpf(v?: string | null): string | undefined {
  if (!v) return undefined;
  const digits = v.replace(/\D/g, "");
  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }
  return v;
}

function formatDateBr(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  // dhEmi: "2025-03-25T10:30:00-03:00" | dEmi: "2025-03-25" | dVenc: "2025-04-25"
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return undefined;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/**
 * Decodes a base64 XML payload (as returned by the Meu Danfe API) into a UTF-8 string.
 */
export function decodeBase64Xml(b64: string): string {
  const binary = atob(b64.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}

/** Heuristic: returns true if the string looks like NF-e XML (not base64-encoded). */
export function looksLikeXml(s: string): boolean {
  const head = s.trimStart().slice(0, 200);
  return head.startsWith("<?xml") || /<(nfeProc|NFe|infNFe)\b/i.test(head);
}
