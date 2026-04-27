import test from "node:test";
import assert from "node:assert/strict";
import { cleanNfeItemDescription, parseBrazilianNumber, parseNfePdf } from "./nfeDanfeParser";

const sample = `
NOTA FISCAL ELETRONICA DANFE
CARMEL INDUSTRIA E COMERCIO DE SOBREMESAS LTDA
CNPJ 28.620.040/0001-55
NF-e nº 57022
SÉRIE 1
CHAVE DE ACESSO
4125 0328 6200 4000 0155 5500 1000 0570 2210 0309 5203
DESTINATÁRIO RONDONOPOLIS COMERCIO DE SORVETES LTDA
DATA DE EMISSÃO 11/03/2025
VALOR TOTAL DOS PRODUTOS 79.006,50
VALOR TOTAL DA NOTA 79.006,50
FATURA / DUPLICATA
001 Ve.25/03/2025 R$79.006,50
DADOS DOS PRODUTOS / SERVIÇOS
COD.PROD. DESCRIÇÃO DOS PRODUTOS / SERVIÇOS NCM/SH CST CFOP UNID QUANT. VALOR UNITÁRIO VALOR TOTAL
3034 CP 200 ML ZERISSIMO IOG GREGO CX 12 UN (F)CODIGO(/F) 7891111111111 SUB TRIB Base : 779,27 Valor : 54,55
21050090 010 6401 CX 20,0000 38,9637 779,27 779,27 54,55 25,33 7,00 3,25
1202 CREME ACAI ULTRACAI
TRADICIONAL CX 10Lt (R) 7892222222222 (/R)
21069090 000 6101 UN 25,0000 97,6118 2.440,30 2.440,30 170,82 0,00 7,00 0,00
DADOS ADICIONAIS
`;

test("parseBrazilianNumber converts Brazilian decimals", () => {
  assert.equal(parseBrazilianNumber("79.006,50"), 79006.5);
  assert.equal(parseBrazilianNumber("2.440,30"), 2440.3);
  assert.equal(parseBrazilianNumber("20,0000"), 20);
  assert.equal(parseBrazilianNumber("38,9637"), 38.9637);
});

test("cleanNfeItemDescription removes issuer and tax tags", () => {
  assert.equal(
    cleanNfeItemDescription("CP 200 ML (F)CODIGO(/F) 7891111111111 SUB TRIB Base : 10,00 Valor : 2,00"),
    "CP 200 ML",
  );
});

test("parseNfePdf extracts header, invoice installment and block-based items", () => {
  const parsed = parseNfePdf(sample);
  assert.equal(parsed.cabecalho.numero_nfe, "57022");
  assert.equal(parsed.cabecalho.serie, "1");
  assert.equal(parsed.cabecalho.chave_acesso, "41250328620040000155550010000570221003095203");
  assert.equal(parsed.cabecalho.cnpj_fornecedor, "28.620.040/0001-55");
  assert.equal(parsed.cabecalho.data_emissao, "11/03/2025");
  assert.equal(parsed.cabecalho.valor_total_nota, 79006.5);
  assert.deepEqual(parsed.cabecalho.duplicatas[0], {
    parcela: "001",
    vencimento: "25/03/2025",
    valor: 79006.5,
    valorOriginal: "79.006,50",
  });
  assert.equal(parsed.itens.length, 2);
  assert.equal(parsed.itens[0].codigo_fornecedor, "3034");
  assert.equal(parsed.itens[0].unidade, "CX");
  assert.equal(parsed.itens[0].quantidade, 20);
  assert.equal(parsed.itens[0].valor_unitario, 38.9637);
  assert.equal(parsed.itens[0].valor_total, 779.27);
  assert.equal(parsed.itens[1].codigo_fornecedor, "1202");
  assert.equal(parsed.itens[1].descricao_limpa, "CREME ACAI ULTRACAI TRADICIONAL CX 10Lt");
});
