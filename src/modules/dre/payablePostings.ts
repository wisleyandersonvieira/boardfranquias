/**
 * Lancamentos de Contas a Pagar no DRE (regimes de caixa e de competencia).
 *
 * Funcao pura: recebe uma conta com itens, parcelas e pagamentos e devolve
 * "quanto entra em qual subgrupo e em que data". A tela (DREView) so decide
 * quais meses estao selecionados e em que linha da estrutura cada subgrupo cai.
 *
 * Regras de negocio:
 *
 * 1. Valor da parcela. Ao pagar com acrescimo/desconto, o sistema regrava
 *    `installment.amount` ja liquido (original + juros - desconto) - e e esse
 *    liquido que sai do caixa. O valor original fica em
 *    accounts_payable_payments (juros/desconto daquele pagamento).
 *
 * 2. Juros e desconto podem nascer de duas formas:
 *    - "de pagamento": informados na tela de pagamento de uma parcela
 *      (existe registro em accounts_payable_payments);
 *    - "da nota": digitados como item no cadastro da conta, ou vindos de
 *      pagamentos antigos sem registro. E o que sobra dos itens de
 *      juros/desconto depois de descontar os de pagamento.
 *
 * 3. Sinais fixos: juros sempre aumentam a despesa (negativo) e desconto
 *    sempre a reduz (positivo), qualquer que seja o sinal gravado no item.
 *
 * 4. Regime de caixa: cada parcela paga lanca, na data do pagamento,
 *    a sua fatia da nota (itens + juros/desconto da nota) calculada sobre o
 *    valor ORIGINAL da parcela, mais os juros/desconto daquele pagamento.
 *    A soma e sempre igual ao que saiu do caixa (o valor da parcela).
 *
 * 5. Regime de competencia: itens e juros/desconto da nota entram na data de
 *    competencia; juros/desconto de pagamento entram na data do pagamento.
 */

export type DreRegime = "cash" | "competence";

type Numeric = number | string | null | undefined;

export interface PayableProduct {
  name?: string | null;
  subgroup_id?: string | null;
  function_type?: string | null;
}

export interface PayableItem {
  product_id?: string | null;
  total_price?: Numeric;
  products?: PayableProduct | null;
}

export interface PayableInstallment {
  id: string;
  amount?: Numeric;
  payment_date?: string | null;
}

export interface PayablePayment {
  installment_id?: string | null;
  interest_amount?: Numeric;
  discount_amount?: Numeric;
  interest_product_id?: string | null;
  discount_product_id?: string | null;
  created_at?: string | null;
}

export interface PayableAccount {
  id?: string;
  status?: string | null;
  payment_date?: string | null;
  data_competencia?: string | null;
  accounts_payable_items?: PayableItem[] | null;
  accounts_payable_installments?: PayableInstallment[] | null;
  accounts_payable_payments?: PayablePayment[] | null;
  /**
   * Conta com competencia fora do ano consultado, carregada so porque foi paga
   * nele: no regime de competencia entra apenas o que tem data de pagamento.
   */
  _onlyInterestDiscount?: boolean;
}

export interface PostingConfig {
  /** Produto parametrizado como acrescimo (juros) do Contas a Pagar. */
  interestProductId: string | null;
  /** Produto parametrizado como desconto do Contas a Pagar. */
  discountProductId: string | null;
}

export interface Posting {
  /** Data (AAAA-MM-DD) que define o mes do lancamento. */
  date: string;
  /** Subgrupo do produto; null quando o produto nao tem subgrupo cadastrado. */
  subgroupId: string | null;
  /** Valor ja com sinal: despesa negativa, credito positivo. */
  value: number;
  kind: "item" | "interest" | "discount";
  /** Nome do produto, para avisos de itens que ficaram fora do DRE. */
  label: string;
}

const num = (value: Numeric): number => {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/** Evita residuos de ponto flutuante virarem "juros da nota" de fracao de centavo. */
const cents = (value: number): number => (Math.abs(value) < 0.005 ? 0 : value);

const dateOnly = (value: string): string => value.slice(0, 10);

const signedItemValue = (item: PayableItem, value: number): number =>
  (item.products?.function_type || "debit") === "debit" ? -value : value;

const labelOf = (item: PayableItem | undefined, fallback: string): string => item?.products?.name || fallback;

/** Pagamento vigente de cada parcela (o mais recente, se houver mais de um). */
const latestPaymentByInstallment = (payments: PayablePayment[]): Map<string, PayablePayment> => {
  const map = new Map<string, PayablePayment>();
  for (const payment of payments) {
    if (!payment.installment_id) continue;
    const current = map.get(payment.installment_id);
    if (!current || String(payment.created_at ?? "") >= String(current.created_at ?? "")) {
      map.set(payment.installment_id, payment);
    }
  }
  return map;
};

export function buildPayablePostings(account: PayableAccount, regime: DreRegime, config: PostingConfig): Posting[] {
  const postings: Posting[] = [];
  const items = account.accounts_payable_items ?? [];
  const installments = account.accounts_payable_installments ?? [];
  const payments = latestPaymentByInstallment(account.accounts_payable_payments ?? []);

  const isInterest = (item: PayableItem) => !!config.interestProductId && item.product_id === config.interestProductId;
  const isDiscount = (item: PayableItem) => !!config.discountProductId && item.product_id === config.discountProductId;

  const normalItems = items.filter((item) => !isInterest(item) && !isDiscount(item));
  const interestItems = items.filter(isInterest);
  const discountItems = items.filter(isDiscount);

  // O subgrupo (linha do DRE) de juros/desconto vem do produto do proprio item.
  const interestRef = interestItems.find((item) => item.products?.subgroup_id) ?? interestItems[0];
  const discountRef = discountItems.find((item) => item.products?.subgroup_id) ?? discountItems[0];

  const push = (date: string | null | undefined, kind: Posting["kind"], ref: PayableItem | undefined, value: number) => {
    if (!date || cents(value) === 0) return;
    postings.push({
      date: dateOnly(date),
      subgroupId: ref?.products?.subgroup_id ?? null,
      value,
      kind,
      label: labelOf(ref, kind === "interest" ? "Juros" : kind === "discount" ? "Desconto" : "Item sem produto"),
    });
  };
  const pushInterest = (date: string | null | undefined, amount: number) => push(date, "interest", interestRef, -Math.abs(amount));
  const pushDiscount = (date: string | null | undefined, amount: number) => push(date, "discount", discountRef, Math.abs(amount));

  const interestItemsTotal = interestItems.reduce((sum, item) => sum + Math.abs(num(item.total_price)), 0);
  const discountItemsTotal = discountItems.reduce((sum, item) => sum + Math.abs(num(item.total_price)), 0);

  // ------------------------------------------------------------------
  // Conta sem parcelas (a vista): nao ha registro de pagamento, entao todo
  // juros/desconto esta nos itens.
  // ------------------------------------------------------------------
  if (installments.length === 0) {
    if (regime === "cash") {
      if (account.status !== "paid" || !account.payment_date) return postings;
      for (const item of normalItems) {
        const value = num(item.total_price);
        if (value !== 0) push(account.payment_date, "item", item, signedItemValue(item, value));
      }
      pushInterest(account.payment_date, interestItemsTotal);
      pushDiscount(account.payment_date, discountItemsTotal);
      return postings;
    }

    if (!account._onlyInterestDiscount && account.data_competencia) {
      for (const item of normalItems) {
        const value = num(item.total_price);
        if (value !== 0) push(account.data_competencia, "item", item, signedItemValue(item, value));
      }
    }
    // Paga: juros/desconto no mes do pagamento. Em aberto: so pode ter vindo do
    // cadastro da nota, entao acompanha a competencia.
    const adjustmentDate = account.payment_date
      ? account.payment_date
      : account._onlyInterestDiscount
        ? null
        : account.data_competencia;
    pushInterest(adjustmentDate, interestItemsTotal);
    pushDiscount(adjustmentDate, discountItemsTotal);
    return postings;
  }

  // ------------------------------------------------------------------
  // Conta parcelada
  // ------------------------------------------------------------------
  const paidInstallments = installments.filter((inst) => !!inst.payment_date);

  // Juros/desconto informados no pagamento de cada parcela paga. So contam
  // quando o pagamento aponta para o produto parametrizado e a conta tem o
  // item correspondente (e ele que diz em qual linha do DRE lancar).
  const paymentAdjust = new Map<string, { interest: number; discount: number }>();
  let paymentInterestTotal = 0;
  let paymentDiscountTotal = 0;
  for (const inst of paidInstallments) {
    const payment = payments.get(inst.id);
    const interest =
      payment && interestRef && payment.interest_product_id === config.interestProductId
        ? Math.max(0, num(payment.interest_amount))
        : 0;
    const discount =
      payment && discountRef && payment.discount_product_id === config.discountProductId
        ? Math.max(0, num(payment.discount_amount))
        : 0;
    paymentAdjust.set(inst.id, { interest, discount });
    paymentInterestTotal += interest;
    paymentDiscountTotal += discount;
  }

  // O que sobra dos itens e juros/desconto "da nota".
  const noteInterest = cents(Math.max(0, interestItemsTotal - paymentInterestTotal));
  const noteDiscount = cents(Math.max(0, discountItemsTotal - paymentDiscountTotal));

  if (regime === "competence") {
    if (!account._onlyInterestDiscount && account.data_competencia) {
      for (const item of normalItems) {
        const value = num(item.total_price);
        if (value !== 0) push(account.data_competencia, "item", item, signedItemValue(item, value));
      }
      pushInterest(account.data_competencia, noteInterest);
      pushDiscount(account.data_competencia, noteDiscount);
    }
    for (const inst of paidInstallments) {
      const adjust = paymentAdjust.get(inst.id)!;
      pushInterest(inst.payment_date, adjust.interest);
      pushDiscount(inst.payment_date, adjust.discount);
    }
    return postings;
  }

  // Regime de caixa
  if (paidInstallments.length === 0) return postings;

  const normalTotal = normalItems.reduce((sum, item) => sum + num(item.total_price), 0);
  // Valor liquido da nota antes dos ajustes de pagamento: e a base do rateio.
  const noteTotal = normalTotal + noteInterest - noteDiscount;
  if (normalTotal === 0 && interestItems.length === 0 && discountItems.length === 0) return postings;

  for (const inst of paidInstallments) {
    const adjust = paymentAdjust.get(inst.id)!;
    const originalAmount = num(inst.amount) - adjust.interest + adjust.discount;
    const share = noteTotal > 0 ? originalAmount / noteTotal : 1 / installments.length;

    for (const item of normalItems) {
      const proportional = num(item.total_price) * share;
      if (proportional > 0) push(inst.payment_date, "item", item, signedItemValue(item, proportional));
    }
    pushInterest(inst.payment_date, noteInterest * share);
    pushDiscount(inst.payment_date, noteDiscount * share);
    pushInterest(inst.payment_date, adjust.interest);
    pushDiscount(inst.payment_date, adjust.discount);
  }

  return postings;
}

/** Soma dos lancamentos por mes (AAAA-MM) - usada nos testes e conferencias. */
export const totalByMonth = (postings: Posting[]): Record<string, number> => {
  const totals: Record<string, number> = {};
  for (const posting of postings) {
    const key = posting.date.slice(0, 7);
    totals[key] = Math.round(((totals[key] ?? 0) + posting.value) * 100) / 100;
  }
  return totals;
};
