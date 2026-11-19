import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPayablePostings,
  totalByMonth,
  type PayableAccount,
  type PayableItem,
  type Posting,
} from "./payablePostings.ts";

// Os valores abaixo reproduzem notas reais usadas na validacao do DRE.

const JUROS = "prod-juros";
const DESCONTO = "prod-desconto";
const config = { interestProductId: JUROS, discountProductId: DESCONTO };

const item = (subgroup: string | null, total: number, name = "Produto"): PayableItem => ({
  product_id: `p-${name}`,
  total_price: total,
  products: { name, subgroup_id: subgroup, function_type: "debit" },
});
const jurosItem = (total: number): PayableItem => ({
  product_id: JUROS,
  total_price: total,
  products: { name: "Juros", subgroup_id: "financeiras", function_type: "debit" },
});
const descontoItem = (total: number): PayableItem => ({
  product_id: DESCONTO,
  total_price: total,
  products: { name: "Descontos", subgroup_id: "financeiras", function_type: "credit" },
});
const pagamento = (installment_id: string, juros: number, desconto: number) => ({
  installment_id,
  interest_amount: juros,
  discount_amount: desconto,
  interest_product_id: juros > 0 ? JUROS : null,
  discount_product_id: desconto > 0 ? DESCONTO : null,
});

const r2 = (n: number) => Math.round(n * 100) / 100;
const bySubgroup = (postings: Posting[], month?: string) => {
  const out: Record<string, number> = {};
  for (const p of postings) {
    if (month && !p.date.startsWith(month)) continue;
    const key = p.subgroupId ?? "(sem subgrupo)";
    out[key] = r2((out[key] ?? 0) + p.value);
  }
  return out;
};

// ---------------------------------------------------------------------------
// Erro 1 - caixa: desconto/juros de pagamento de parcela contados em dobro
// ---------------------------------------------------------------------------

// Moises NF 6953: nota de 10.403,00, desconto de 2.080,79 no pagamento, saiu 8.322,21.
const moises6953: PayableAccount = {
  status: "paid",
  data_competencia: "2026-09-30",
  accounts_payable_items: [item("merc_diversas", 10403.0), descontoItem(-2080.79)],
  accounts_payable_installments: [{ id: "i1", amount: 8322.21, payment_date: "2026-10-05" }],
  accounts_payable_payments: [pagamento("i1", 0, 2080.79)],
};

test("caixa: desconto no pagamento da parcela nao e contado em dobro", () => {
  const postings = buildPayablePostings(moises6953, "cash", config);
  assert.deepEqual(bySubgroup(postings), { merc_diversas: -10403.0, financeiras: 2080.79 });
  // O total e exatamente o que saiu do caixa.
  assert.deepEqual(totalByMonth(postings), { "2026-10": -8322.21 });
});

test("competencia: despesa cheia na competencia e desconto no mes do pagamento", () => {
  const postings = buildPayablePostings(moises6953, "competence", config);
  assert.deepEqual(bySubgroup(postings, "2026-09"), { merc_diversas: -10403.0 });
  assert.deepEqual(bySubgroup(postings, "2026-10"), { financeiras: 2080.79 });
});

// Vagner (internet): 6 parcelas de 99,99, cada uma paga com 10,00 de desconto.
const vagner: PayableAccount = {
  status: "partial",
  data_competencia: "2026-06-01",
  accounts_payable_items: [item("telefone", 599.94), descontoItem(-10), descontoItem(-10), descontoItem(-10)],
  accounts_payable_installments: [
    { id: "i1", amount: 89.99, payment_date: "2026-06-15" },
    { id: "i2", amount: 89.99, payment_date: "2026-07-15" },
    { id: "i3", amount: 89.99, payment_date: "2026-08-17" },
    { id: "i4", amount: 99.99, payment_date: null },
    { id: "i5", amount: 99.99, payment_date: null },
    { id: "i6", amount: 99.99, payment_date: null },
  ],
  accounts_payable_payments: [pagamento("i1", 0, 10), pagamento("i2", 0, 10), pagamento("i3", 0, 10)],
};

test("caixa: conta parcialmente paga lanca so as parcelas pagas, cada uma pelo valor original", () => {
  const postings = buildPayablePostings(vagner, "cash", config);
  assert.deepEqual(bySubgroup(postings, "2026-08"), { telefone: -99.99, financeiras: 10 });
  assert.deepEqual(totalByMonth(postings), { "2026-06": -89.99, "2026-07": -89.99, "2026-08": -89.99 });
});

// Receita Federal (parcelamento): parcela de 608,17 paga com 6,09 de juros = 614,26.
const receita: PayableAccount = {
  status: "partial",
  data_competencia: "2025-12-01",
  accounts_payable_items: [item("impostos", 36490.2), jurosItem(6.09)],
  accounts_payable_installments: [
    { id: "i1", amount: 608.17, payment_date: "2026-08-31" },
    { id: "i2", amount: 614.26, payment_date: "2026-09-28" },
    ...Array.from({ length: 58 }, (_, k) => ({ id: `r${k}`, amount: 608.17, payment_date: null })),
  ],
  accounts_payable_payments: [pagamento("i1", 0, 0), pagamento("i2", 6.09, 0)],
};

test("caixa: juros no pagamento da parcela nao sao contados em dobro", () => {
  const postings = buildPayablePostings(receita, "cash", config);
  assert.deepEqual(bySubgroup(postings, "2026-09"), { impostos: -608.17, financeiras: -6.09 });
  assert.deepEqual(totalByMonth(postings), { "2026-08": -608.17, "2026-09": -614.26 });
});

// ---------------------------------------------------------------------------
// Erro 2 - competencia: desconto/juros digitados como item da nota parcelada
// ---------------------------------------------------------------------------

// Carmel NF 83094: itens 14.586,99, desconto de 3.337,26 no cadastro, parcela unica de 11.249,73.
const carmel83094: PayableAccount = {
  status: "paid",
  data_competencia: "2026-10-31",
  accounts_payable_items: [item("merc_carmel", 14586.99), descontoItem(-3337.26)],
  accounts_payable_installments: [{ id: "i1", amount: 11249.73, payment_date: "2026-10-26" }],
  accounts_payable_payments: [pagamento("i1", 0, 0)],
};

test("competencia: desconto digitado na nota parcelada entra no mes de competencia", () => {
  const postings = buildPayablePostings(carmel83094, "competence", config);
  assert.deepEqual(bySubgroup(postings), { merc_carmel: -14586.99, financeiras: 3337.26 });
  assert.deepEqual(totalByMonth(postings), { "2026-10": -11249.73 });
});

test("caixa: desconto digitado na nota continua fechando com o valor pago", () => {
  const postings = buildPayablePostings(carmel83094, "cash", config);
  assert.deepEqual(bySubgroup(postings), { merc_carmel: -14586.99, financeiras: 3337.26 });
  assert.deepEqual(totalByMonth(postings), { "2026-10": -11249.73 });
});

test("competencia: desconto da nota aparece mesmo com a parcela ainda em aberto", () => {
  const aberta: PayableAccount = {
    ...carmel83094,
    status: "pending",
    accounts_payable_installments: [{ id: "i1", amount: 11249.73, payment_date: null }],
    accounts_payable_payments: [],
  };
  assert.deepEqual(totalByMonth(buildPayablePostings(aberta, "competence", config)), { "2026-10": -11249.73 });
  assert.deepEqual(buildPayablePostings(aberta, "cash", config), []);
});

// Carmel NF 77728: juros de 857,38 digitados na nota + 0,03 no pagamento; saiu 17.560,13.
test("juros da nota e juros do pagamento convivem na mesma conta", () => {
  const conta: PayableAccount = {
    status: "paid",
    data_competencia: "2026-05-31",
    accounts_payable_items: [item("merc_carmel", 16702.72), jurosItem(857.38), jurosItem(0.03)],
    accounts_payable_installments: [{ id: "i1", amount: 17560.13, payment_date: "2026-06-10" }],
    accounts_payable_payments: [pagamento("i1", 0.03, 0)],
  };
  assert.deepEqual(totalByMonth(buildPayablePostings(conta, "cash", config)), { "2026-06": -17560.13 });
  const competencia = buildPayablePostings(conta, "competence", config);
  assert.deepEqual(bySubgroup(competencia, "2026-05"), { merc_carmel: -16702.72, financeiras: -857.38 });
  assert.deepEqual(bySubgroup(competencia, "2026-06"), { financeiras: -0.03 });
});

// ---------------------------------------------------------------------------
// Erro 3 - desconto de nota a vista com sinal trocado (os dois regimes)
// ---------------------------------------------------------------------------

// Nicopel NF 65288: itens 2.645,35, desconto 173,97, pago 2.471,38 em fevereiro.
const nicopel: PayableAccount = {
  status: "paid",
  data_competencia: "2026-01-14",
  payment_date: "2026-02-18",
  accounts_payable_items: [item("embalagens", 2645.35), descontoItem(-173.97)],
  accounts_payable_installments: [],
};

test("a vista: desconto reduz a despesa nos dois regimes", () => {
  const caixa = buildPayablePostings(nicopel, "cash", config);
  assert.deepEqual(bySubgroup(caixa), { embalagens: -2645.35, financeiras: 173.97 });
  assert.deepEqual(totalByMonth(caixa), { "2026-02": -2471.38 });

  const competencia = buildPayablePostings(nicopel, "competence", config);
  assert.deepEqual(bySubgroup(competencia, "2026-01"), { embalagens: -2645.35 });
  assert.deepEqual(bySubgroup(competencia, "2026-02"), { financeiras: 173.97 });
});

test("a vista: juros continuam aumentando a despesa", () => {
  const conta: PayableAccount = {
    status: "paid",
    data_competencia: "2026-06-09",
    payment_date: "2026-06-20",
    accounts_payable_items: [item("merc_diversas", 1932.96), jurosItem(185.41)],
    accounts_payable_installments: [],
  };
  assert.deepEqual(totalByMonth(buildPayablePostings(conta, "cash", config)), { "2026-06": -2118.37 });
  assert.deepEqual(totalByMonth(buildPayablePostings(conta, "competence", config)), { "2026-06": -2118.37 });
});

test("a vista em aberto: caixa nao lanca nada; competencia lanca nota e desconto na competencia", () => {
  const conta: PayableAccount = { ...nicopel, status: "pending", payment_date: null };
  assert.deepEqual(buildPayablePostings(conta, "cash", config), []);
  assert.deepEqual(totalByMonth(buildPayablePostings(conta, "competence", config)), { "2026-01": -2471.38 });
});

// ---------------------------------------------------------------------------
// Erro 4 - conta de competencia de outro ano paga no ano consultado
// ---------------------------------------------------------------------------

test("competencia: conta de outro ano entra so com juros/desconto de pagamento", () => {
  const postings = buildPayablePostings({ ...receita, _onlyInterestDiscount: true }, "competence", config);
  assert.deepEqual(
    postings.map((p) => [p.date, p.subgroupId, p.value]),
    [["2026-09-28", "financeiras", -6.09]],
  );
});

// ---------------------------------------------------------------------------
// Casos que ja estavam certos e precisam continuar iguais
// ---------------------------------------------------------------------------

test("sem juros nem desconto: caixa rateia pelo valor da parcela e competencia lanca cheio", () => {
  const conta: PayableAccount = {
    status: "paid",
    data_competencia: "2026-08-10",
    accounts_payable_items: [item("merc_diversas", 600), item("limpeza", 300)],
    accounts_payable_installments: [
      { id: "i1", amount: 450, payment_date: "2026-08-20" },
      { id: "i2", amount: 450, payment_date: "2026-09-20" },
    ],
    accounts_payable_payments: [pagamento("i1", 0, 0), pagamento("i2", 0, 0)],
  };
  const caixa = buildPayablePostings(conta, "cash", config);
  assert.deepEqual(bySubgroup(caixa, "2026-08"), { merc_diversas: -300, limpeza: -150 });
  assert.deepEqual(bySubgroup(caixa, "2026-09"), { merc_diversas: -300, limpeza: -150 });
  assert.deepEqual(bySubgroup(buildPayablePostings(conta, "competence", config)), { merc_diversas: -600, limpeza: -300 });
});

test("caixa: parcela maior que os itens (frete nao itemizado) continua fechando com o valor pago", () => {
  // Ikeda NF 1518721: itens 402,71, parcela 420,39.
  const conta: PayableAccount = {
    status: "paid",
    data_competencia: "2026-10-01",
    accounts_payable_items: [item("merc_diversas", 398.5), item("merc_diversas", 4.21)],
    accounts_payable_installments: [{ id: "i1", amount: 420.39, payment_date: "2026-10-09" }],
    accounts_payable_payments: [pagamento("i1", 0, 0)],
  };
  assert.deepEqual(totalByMonth(buildPayablePostings(conta, "cash", config)), { "2026-10": -420.39 });
});

test("produto de credito e item sem subgrupo", () => {
  const conta: PayableAccount = {
    status: "paid",
    data_competencia: "2026-09-01",
    payment_date: "2026-09-11",
    accounts_payable_items: [
      item("merc_diversas", 1012.32),
      item(null, 119.76, "LEITE L.VIDA"),
      { product_id: "p-credito", total_price: 50, products: { name: "Bonificacao", subgroup_id: "outros", function_type: "credit" } },
    ],
    accounts_payable_installments: [],
  };
  const postings = buildPayablePostings(conta, "cash", config);
  assert.deepEqual(bySubgroup(postings), { merc_diversas: -1012.32, "(sem subgrupo)": -119.76, outros: 50 });
  // O item sem subgrupo e devolvido com nome, para a tela poder avisar.
  assert.equal(postings.find((p) => p.subgroupId === null)?.label, "LEITE L.VIDA");
});

test("sem produto de juros/desconto parametrizado, os itens sao tratados como normais", () => {
  const postings = buildPayablePostings(nicopel, "cash", { interestProductId: null, discountProductId: null });
  // Mantem o comportamento antigo: vale o tipo (credito/debito) do proprio produto.
  assert.deepEqual(bySubgroup(postings), { embalagens: -2645.35, financeiras: -173.97 });
});

test("pagamento estornado e refeito: vale o registro mais recente da parcela", () => {
  const conta: PayableAccount = {
    ...moises6953,
    accounts_payable_payments: [
      { ...pagamento("i1", 0, 500), created_at: "2026-10-01T10:00:00Z" },
      { ...pagamento("i1", 0, 2080.79), created_at: "2026-10-05T10:00:00Z" },
    ],
  };
  assert.deepEqual(totalByMonth(buildPayablePostings(conta, "cash", config)), { "2026-10": -8322.21 });
});
