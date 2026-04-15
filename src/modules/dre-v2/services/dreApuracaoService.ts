import type {
  DREApuracaoResult,
  DREAuditEntry,
  DREDiagnosticCounter,
  DREFilters,
  DRELineResult,
  DREOriginRecord,
  DRESummaryCard,
  DREValidationResult,
} from "@/modules/dre-v2/types";
import { fetchStructureDefinition } from "@/modules/dre-v2/services/dreStructureAuditService";
import { fetchAllPages, supabase } from "@/modules/dre-v2/services/paginatedSupabase";
import {
  buildColumnId,
  calculatePercent,
  DRE_MONTHS,
  getMonthYearFromDate,
  monthKeyFromDate,
  normalizeMonths,
} from "@/modules/dre-v2/utils";

type QueryStat = { label: string; pages: number; records: number; pageSize: number };

type RecordsBuildResult = {
  records: DREOriginRecord[];
  unmappedRecords: DREOriginRecord[];
  queryStats: QueryStat[];
};

function formatStoreScopedKey(storeId: string, monthKey: string): string {
  return `${storeId}:${monthKey}`;
}

function buildSelectedMonthKeys(filters: DREFilters): string[] {
  return normalizeMonths(filters.months).map((month) => `${filters.year}-${String(month).padStart(2, "0")}`);
}

function isDateInsideFilters(dateValue: string | null | undefined, filters: DREFilters, criterion: "competence" | "payment"): boolean {
  if (!dateValue) {
    return false;
  }

  const monthKey = monthKeyFromDate(dateValue);
  const monthAllowed = buildSelectedMonthKeys(filters).includes(monthKey);
  if (!monthAllowed) {
    return false;
  }

  const customStart = criterion === "competence" ? filters.competenceStart : filters.paymentStart;
  const customEnd = criterion === "competence" ? filters.competenceEnd : filters.paymentEnd;

  if (customStart && dateValue < customStart) {
    return false;
  }
  if (customEnd && dateValue > customEnd) {
    return false;
  }

  return true;
}

function buildDiagnosticCounters(records: DREOriginRecord[], keyBuilder: (record: DREOriginRecord) => string): DREDiagnosticCounter[] {
  const counters = new Map<string, DREDiagnosticCounter>();

  records.forEach((record) => {
    const label = keyBuilder(record);
    const current = counters.get(label) || { label, count: 0, amount: 0 };
    current.count += 1;
    current.amount += record.value;
    counters.set(label, current);
  });

  return Array.from(counters.values()).sort((left, right) => right.count - left.count);
}

function getLineRecordIds(line: DRELineResult): string[] {
  return [...new Set(line.auditRecordIds)];
}

function inferSummaryCards(result: Pick<DREApuracaoResult, "lineResults">): DRESummaryCard[] {
  const findLine = (...patterns: string[]) =>
    result.lineResults.find((line) =>
      patterns.some((pattern) => line.item.name.toLowerCase().includes(pattern)),
    );

  const faturamento = findLine("faturamento", "receita bruta", "receita total")?.total || 0;
  const cmv = findLine("cmv", "custo")?.total || 0;
  const lucroBruto = findLine("lucro bruto")?.total || faturamento + cmv;
  const despesasOperacionais =
    findLine("despesas operacionais", "despesa operacional", "despesas fixas")?.total || 0;
  const ebitda = findLine("ebitda")?.total || lucroBruto + despesasOperacionais;
  const lucroLiquido = findLine("lucro líquido", "resultado")?.total || ebitda;

  return [
    { id: "faturamento", label: "Faturamento", value: faturamento, percent: 1 },
    { id: "cmv", label: "CMV", value: cmv, percent: calculatePercent(cmv, faturamento) },
    { id: "lucro-bruto", label: "Lucro Bruto", value: lucroBruto, percent: calculatePercent(lucroBruto, faturamento) },
    {
      id: "despesas-operacionais",
      label: "Despesas Operacionais",
      value: despesasOperacionais,
      percent: calculatePercent(despesasOperacionais, faturamento),
    },
    { id: "ebitda", label: "EBITDA", value: ebitda, percent: calculatePercent(ebitda, faturamento) },
    {
      id: "lucro-liquido",
      label: "Lucro Líquido",
      value: lucroLiquido,
      percent: calculatePercent(lucroLiquido, faturamento),
    },
  ];
}

function buildColumns(filters: DREFilters, storeNameMap: Record<string, string>) {
  const months = normalizeMonths(filters.months);
  const baseColumns = months.map((month) => ({
    month,
    year: filters.year,
    label: `${DRE_MONTHS.find((entry) => entry.value === month)?.label || month}/${filters.year}`,
  }));

  if (!filters.groupByStore) {
    return baseColumns.map((column) => ({
      id: buildColumnId(column.year, column.month),
      ...column,
    }));
  }

  return baseColumns.flatMap((column) =>
    filters.storeIds.map((storeId) => ({
      id: buildColumnId(column.year, column.month, storeId),
      ...column,
      storeId,
      storeName: storeNameMap[storeId] || "Loja",
      label: `${column.label} - ${storeNameMap[storeId] || "Loja"}`,
    })),
  );
}

function createValueBucket(columns: Array<{ id: string }>): Record<string, number> {
  return columns.reduce<Record<string, number>>((accumulator, column) => {
    accumulator[column.id] = 0;
    return accumulator;
  }, {});
}

function addRecordToColumn(
  target: Record<string, number>,
  record: DREOriginRecord,
  filters: DREFilters,
): void {
  const { year, month } = getMonthYearFromDate(record.dateUsed);
  const columnId = filters.groupByStore
    ? buildColumnId(year, month, record.storeId)
    : buildColumnId(year, month);

  target[columnId] = (target[columnId] || 0) + record.value;
}

async function buildOriginRecords(filters: DREFilters, structure: Awaited<ReturnType<typeof fetchStructureDefinition>>): Promise<RecordsBuildResult> {
  const queryStats: QueryStat[] = [];
  const records: DREOriginRecord[] = [];
  const unmappedRecords: DREOriginRecord[] = [];
  const monthKeys = buildSelectedMonthKeys(filters);
  const yearStart = `${filters.year}-01-01`;
  const yearEnd = `${filters.year}-12-31`;

  const { rows: parameters, pages: parameterPages, pageSize: parameterPageSize } = await fetchAllPages<any>((from, to) =>
    supabase
      .from("system_parameters")
      .select("parameter_key, subgroup_id, product_id")
      .in("parameter_key", [
        "venda_dinheiro",
        "venda_cartao",
        "venda_contas",
        "venda_delivery",
        "acrescimo",
        "desconto",
        "acrescimo_pagar",
        "acrescimo_receber",
        "desconto_pagar",
        "desconto_receber",
        "aporte_socios",
        "retirada_socios",
      ])
      .range(from, to),
  );

  queryStats.push({ label: "system_parameters", pages: parameterPages, records: parameters.length, pageSize: parameterPageSize });

  const parameterSubgroups: Record<string, string> = {};
  const parameterProducts: Record<string, string> = {};
  parameters.forEach((parameter) => {
    if (parameter.subgroup_id) {
      parameterSubgroups[parameter.parameter_key] = parameter.subgroup_id;
    }
    if (parameter.product_id) {
      parameterProducts[parameter.parameter_key] = parameter.product_id;
    }
  });

  const { rows: cashRows, pages: cashPages, pageSize: cashPageSize } = await fetchAllPages<any>((from, to) =>
    supabase
      .from("cash_control")
      .select("id, store_id, date, faturamento_dinheiro, faturamento_cartao, faturamento_conta, faturamento_delivery, stores(name)")
      .in("store_id", filters.storeIds)
      .gte("date", yearStart)
      .lte("date", yearEnd)
      .range(from, to),
  );
  queryStats.push({ label: "cash_control", pages: cashPages, records: cashRows.length, pageSize: cashPageSize });

  cashRows.forEach((row) => {
    if (!isDateInsideFilters(row.date, filters, "competence")) {
      return;
    }

    const entries = [
      ["venda_dinheiro", Number(row.faturamento_dinheiro || 0)],
      ["venda_cartao", Number(row.faturamento_cartao || 0)],
      ["venda_contas", Number(row.faturamento_conta || 0)],
      ["venda_delivery", Number(row.faturamento_delivery || 0)],
    ] as const;

    entries.forEach(([parameterKey, amount]) => {
      if (!amount) {
        return;
      }

      const subgroupId = parameterSubgroups[parameterKey];
      const structureItemIds = subgroupId ? structure.subgroupToItems[subgroupId] || [] : [];
      const record: DREOriginRecord = {
        id: `cash:${row.id}:${parameterKey}`,
        origin: "cash_control",
        sourceTable: "cash_control",
        sourceId: row.id,
        structureItemIds,
        subgroupId,
        storeId: row.store_id,
        storeName: row.stores?.name || "Loja",
        value: amount,
        grossValue: amount,
        dateUsed: row.date,
        dateCriterion: "cash_control_date",
        competenceDate: row.date,
        paymentDate: row.date,
        storeScopedKey: formatStoreScopedKey(row.store_id, monthKeyFromDate(row.date)),
        monthKey: monthKeyFromDate(row.date),
        description: `Faturamento ${parameterKey.replace("venda_", "")}`,
      };

      if (structureItemIds.length === 0) {
        unmappedRecords.push(record);
      } else {
        records.push(record);
      }
    });
  });

  const { rows: payablePayments, pages: payablePaymentPages, pageSize: payablePaymentPageSize } = await fetchAllPages<any>((from, to) =>
    supabase
      .from("accounts_payable_payments")
      .select("id, installment_id, account_payable_id, payment_date, amount_paid, interest_amount, discount_amount, interest_product_id, discount_product_id")
      .gte("payment_date", yearStart)
      .lte("payment_date", yearEnd)
      .range(from, to),
  );
  queryStats.push({
    label: "accounts_payable_payments",
    pages: payablePaymentPages,
    records: payablePayments.length,
    pageSize: payablePaymentPageSize,
  });

  const payablePaymentsByInstallment = payablePayments.reduce<Record<string, any[]>>((accumulator, payment) => {
    accumulator[payment.installment_id] = accumulator[payment.installment_id] || [];
    accumulator[payment.installment_id].push(payment);
    return accumulator;
  }, {});

  const { rows: payableAccounts, pages: payablePages, pageSize: payablePageSize } = await fetchAllPages<any>((from, to) =>
    supabase
      .from("accounts_payable")
      .select(`
        id,
        store_id,
        status,
        description,
        document_number,
        due_date,
        payment_date,
        data_competencia,
        total_amount,
        stores(name),
        accounts_payable_items (
          id,
          product_id,
          quantity,
          unit_price,
          total_price,
          products (
            id,
            name,
            subgroup_id,
            function_type
          )
        ),
        accounts_payable_installments (
          id,
          installment_number,
          due_date,
          amount,
          payment_date
        )
      `)
      .in("store_id", filters.storeIds)
      .or(`data_competencia.gte.${yearStart},payment_date.gte.${yearStart}`)
      .range(from, to),
  );
  queryStats.push({ label: "accounts_payable", pages: payablePages, records: payableAccounts.length, pageSize: payablePageSize });

  payableAccounts.forEach((account) => {
    const normalItems = (account.accounts_payable_items || []).filter(
      (item: any) => item.product_id !== parameterProducts.acrescimo_pagar && item.product_id !== parameterProducts.desconto_pagar,
    );
    const adjustmentItems = (account.accounts_payable_items || []).filter(
      (item: any) => item.product_id === parameterProducts.acrescimo_pagar || item.product_id === parameterProducts.desconto_pagar,
    );
    const baseAmount = normalItems.reduce((sum: number, item: any) => sum + Number(item.total_price || 0), 0);

    const pushItemRecord = (
      item: any,
      amount: number,
      dateUsed: string,
      dateCriterion: DREOriginRecord["dateCriterion"],
      suffix: string,
      grossValue = amount,
    ) => {
      if (!amount) {
        return;
      }

      const subgroupId = item.products?.subgroup_id || null;
      const structureItemIds = subgroupId ? structure.subgroupToItems[subgroupId] || [] : [];
      const functionType = item.products?.function_type || "debit";
      const signedValue = functionType === "debit" ? -Math.abs(amount) : Math.abs(amount);
      const record: DREOriginRecord = {
        id: `ap:${account.id}:${item.id}:${suffix}`,
        origin: "accounts_payable",
        sourceTable: "accounts_payable",
        sourceId: account.id,
        sourceDetailId: item.id,
        structureItemIds,
        subgroupId,
        subgroupName: item.products?.name,
        storeId: account.store_id,
        storeName: account.stores?.name || "Loja",
        value: signedValue,
        grossValue,
        dateUsed,
        dateCriterion,
        competenceDate: account.data_competencia,
        paymentDate: account.payment_date,
        dueDate: account.due_date,
        documentNumber: account.document_number,
        description: account.description,
        paymentStatus: account.status,
        storeScopedKey: formatStoreScopedKey(account.store_id, monthKeyFromDate(dateUsed)),
        monthKey: monthKeyFromDate(dateUsed),
      };

      if (structureItemIds.length === 0) {
        unmappedRecords.push(record);
      } else {
        records.push(record);
      }
    };

    if (filters.regime === "competence" && isDateInsideFilters(account.data_competencia, filters, "competence")) {
      normalItems.forEach((item: any) => {
        pushItemRecord(item, Number(item.total_price || 0), account.data_competencia, "competence", "competence");
      });
    }

    const installments = account.accounts_payable_installments || [];
    if (filters.regime === "cash") {
      if (installments.length > 0) {
        installments.forEach((installment: any) => {
          if (!isDateInsideFilters(installment.payment_date, filters, "payment")) {
            return;
          }

          const proportion = baseAmount > 0 ? Number(installment.amount || 0) / baseAmount : 1 / Math.max(installments.length, 1);
          normalItems.forEach((item: any) => {
            pushItemRecord(
              item,
              Number(item.total_price || 0) * proportion,
              installment.payment_date,
              "payment",
              `cash:${installment.id}`,
            );
          });

          const payments = payablePaymentsByInstallment[installment.id] || [];
          payments.forEach((payment: any) => {
            adjustmentItems.forEach((item: any) => {
              if (item.product_id === payment.interest_product_id && payment.interest_amount > 0) {
                pushItemRecord(item, Number(payment.interest_amount || 0), payment.payment_date, "payment", `interest:${payment.id}`);
              }
              if (item.product_id === payment.discount_product_id && payment.discount_amount > 0) {
                pushItemRecord(item, Number(payment.discount_amount || 0), payment.payment_date, "payment", `discount:${payment.id}`);
              }
            });
          });
        });
      } else if (isDateInsideFilters(account.payment_date, filters, "payment")) {
        normalItems.forEach((item: any) => {
          pushItemRecord(item, Number(item.total_price || 0), account.payment_date, "payment", "cash");
        });
        adjustmentItems.forEach((item: any) => {
          pushItemRecord(item, Number(item.total_price || 0), account.payment_date, "payment", "cash-adjustment");
        });
      }
    } else {
      installments.forEach((installment: any) => {
        if (!isDateInsideFilters(installment.payment_date, filters, "payment")) {
          return;
        }
        const payments = payablePaymentsByInstallment[installment.id] || [];
        payments.forEach((payment: any) => {
          adjustmentItems.forEach((item: any) => {
            if (item.product_id === payment.interest_product_id && payment.interest_amount > 0) {
              pushItemRecord(item, Number(payment.interest_amount || 0), payment.payment_date, "payment", `interest:${payment.id}`);
            }
            if (item.product_id === payment.discount_product_id && payment.discount_amount > 0) {
              pushItemRecord(item, Number(payment.discount_amount || 0), payment.payment_date, "payment", `discount:${payment.id}`);
            }
          });
        });
      });
    }
  });

  const { rows: receivablePayments, pages: receivablePaymentPages, pageSize: receivablePaymentPageSize } = await fetchAllPages<any>((from, to) =>
    supabase
      .from("accounts_receivable_payments")
      .select("id, installment_id, account_receivable_id, payment_date, amount_paid, interest_amount, discount_amount, interest_product_id, discount_product_id")
      .gte("payment_date", yearStart)
      .lte("payment_date", yearEnd)
      .range(from, to),
  );
  queryStats.push({
    label: "accounts_receivable_payments",
    pages: receivablePaymentPages,
    records: receivablePayments.length,
    pageSize: receivablePaymentPageSize,
  });

  const receivablePaymentsByInstallment = receivablePayments.reduce<Record<string, any[]>>((accumulator, payment) => {
    accumulator[payment.installment_id] = accumulator[payment.installment_id] || [];
    accumulator[payment.installment_id].push(payment);
    return accumulator;
  }, {});

  const { rows: receivableAccounts, pages: receivablePages, pageSize: receivablePageSize } = await fetchAllPages<any>((from, to) =>
    supabase
      .from("accounts_receivable")
      .select(`
        id,
        store_id,
        status,
        description,
        document_number,
        due_date,
        payment_date,
        data_competencia,
        total_amount,
        stores(name),
        accounts_receivable_items (
          id,
          product_id,
          quantity,
          unit_price,
          total_price,
          products (
            id,
            name,
            subgroup_id,
            function_type
          )
        ),
        accounts_receivable_installments (
          id,
          installment_number,
          due_date,
          amount,
          payment_date
        )
      `)
      .in("store_id", filters.storeIds)
      .or(`data_competencia.gte.${yearStart},payment_date.gte.${yearStart}`)
      .range(from, to),
  );
  queryStats.push({
    label: "accounts_receivable",
    pages: receivablePages,
    records: receivableAccounts.length,
    pageSize: receivablePageSize,
  });

  receivableAccounts.forEach((account) => {
    const normalItems = (account.accounts_receivable_items || []).filter(
      (item: any) => item.product_id !== parameterProducts.acrescimo_receber && item.product_id !== parameterProducts.desconto_receber,
    );
    const adjustmentItems = (account.accounts_receivable_items || []).filter(
      (item: any) => item.product_id === parameterProducts.acrescimo_receber || item.product_id === parameterProducts.desconto_receber,
    );
    const baseAmount = normalItems.reduce((sum: number, item: any) => sum + Number(item.total_price || 0), 0);

    const pushItemRecord = (
      item: any,
      amount: number,
      dateUsed: string,
      dateCriterion: DREOriginRecord["dateCriterion"],
      suffix: string,
      grossValue = amount,
    ) => {
      if (!amount) {
        return;
      }

      const subgroupId = item.products?.subgroup_id || null;
      const structureItemIds = subgroupId ? structure.subgroupToItems[subgroupId] || [] : [];
      const isDiscount = item.product_id === parameterProducts.desconto_receber;
      const functionType = item.products?.function_type || "credit";
      const signedValue = isDiscount
        ? -Math.abs(amount)
        : functionType === "credit"
          ? Math.abs(amount)
          : -Math.abs(amount);

      const record: DREOriginRecord = {
        id: `ar:${account.id}:${item.id}:${suffix}`,
        origin: "accounts_receivable",
        sourceTable: "accounts_receivable",
        sourceId: account.id,
        sourceDetailId: item.id,
        structureItemIds,
        subgroupId,
        subgroupName: item.products?.name,
        storeId: account.store_id,
        storeName: account.stores?.name || "Loja",
        value: signedValue,
        grossValue,
        dateUsed,
        dateCriterion,
        competenceDate: account.data_competencia,
        paymentDate: account.payment_date,
        dueDate: account.due_date,
        documentNumber: account.document_number,
        description: account.description,
        paymentStatus: account.status,
        storeScopedKey: formatStoreScopedKey(account.store_id, monthKeyFromDate(dateUsed)),
        monthKey: monthKeyFromDate(dateUsed),
      };

      if (structureItemIds.length === 0) {
        unmappedRecords.push(record);
      } else {
        records.push(record);
      }
    };

    if (filters.regime === "competence" && isDateInsideFilters(account.data_competencia, filters, "competence")) {
      normalItems.forEach((item: any) => {
        pushItemRecord(item, Number(item.total_price || 0), account.data_competencia, "competence", "competence");
      });
    }

    const installments = account.accounts_receivable_installments || [];
    if (filters.regime === "cash") {
      if (installments.length > 0) {
        installments.forEach((installment: any) => {
          if (!isDateInsideFilters(installment.payment_date, filters, "payment")) {
            return;
          }

          const proportion = baseAmount > 0 ? Number(installment.amount || 0) / baseAmount : 1 / Math.max(installments.length, 1);
          normalItems.forEach((item: any) => {
            pushItemRecord(
              item,
              Number(item.total_price || 0) * proportion,
              installment.payment_date,
              "payment",
              `cash:${installment.id}`,
            );
          });

          const payments = receivablePaymentsByInstallment[installment.id] || [];
          payments.forEach((payment: any) => {
            adjustmentItems.forEach((item: any) => {
              if (item.product_id === payment.interest_product_id && payment.interest_amount > 0) {
                pushItemRecord(item, Number(payment.interest_amount || 0), payment.payment_date, "payment", `interest:${payment.id}`);
              }
              if (item.product_id === payment.discount_product_id && payment.discount_amount > 0) {
                pushItemRecord(item, Number(payment.discount_amount || 0), payment.payment_date, "payment", `discount:${payment.id}`);
              }
            });
          });
        });
      } else if (isDateInsideFilters(account.payment_date, filters, "payment")) {
        normalItems.forEach((item: any) => {
          pushItemRecord(item, Number(item.total_price || 0), account.payment_date, "payment", "cash");
        });
        adjustmentItems.forEach((item: any) => {
          pushItemRecord(item, Number(item.total_price || 0), account.payment_date, "payment", "cash-adjustment");
        });
      }
    } else {
      installments.forEach((installment: any) => {
        if (!isDateInsideFilters(installment.payment_date, filters, "payment")) {
          return;
        }

        const payments = receivablePaymentsByInstallment[installment.id] || [];
        payments.forEach((payment: any) => {
          adjustmentItems.forEach((item: any) => {
            if (item.product_id === payment.interest_product_id && payment.interest_amount > 0) {
              pushItemRecord(item, Number(payment.interest_amount || 0), payment.payment_date, "payment", `interest:${payment.id}`);
            }
            if (item.product_id === payment.discount_product_id && payment.discount_amount > 0) {
              pushItemRecord(item, Number(payment.discount_amount || 0), payment.payment_date, "payment", `discount:${payment.id}`);
            }
          });
        });
      });
    }
  });

  const { rows: partnerRows, pages: partnerPages, pageSize: partnerPageSize } = await fetchAllPages<any>((from, to) =>
    supabase
      .from("partner_transactions")
      .select("id, store_id, payment_date, competence_date, amount, transaction_type, description, stores(name)")
      .in("store_id", filters.storeIds)
      .range(from, to),
  );
  queryStats.push({
    label: "partner_transactions",
    pages: partnerPages,
    records: partnerRows.length,
    pageSize: partnerPageSize,
  });

  const partnerProductIds = [parameterProducts.aporte_socios, parameterProducts.retirada_socios].filter(Boolean) as string[];
  let partnerProducts: any[] = [];
  if (partnerProductIds.length > 0) {
    const { rows, pages, pageSize } = await fetchAllPages<any>((from, to) =>
      supabase
        .from("products")
        .select("id, name, subgroup_id, function_type")
        .in("id", partnerProductIds)
        .range(from, to),
    );
    partnerProducts = rows;
    queryStats.push({ label: "products:partner", pages, records: rows.length, pageSize });
  }

  partnerRows.forEach((row) => {
    const dateField = filters.regime === "cash" ? row.payment_date : row.competence_date;
    const criterion = filters.regime === "cash" ? "payment" : "competence";
    if (!isDateInsideFilters(dateField, filters, criterion)) {
      return;
    }

    const parameterProductId =
      row.transaction_type === "aporte" ? parameterProducts.aporte_socios : parameterProducts.retirada_socios;
    const product = partnerProducts.find((entry) => entry.id === parameterProductId);
    const subgroupId = product?.subgroup_id || null;
    const structureItemIds = subgroupId ? structure.subgroupToItems[subgroupId] || [] : [];
    const functionType = product?.function_type || (row.transaction_type === "aporte" ? "credit" : "debit");
    const signedValue = functionType === "credit" ? Math.abs(Number(row.amount || 0)) : -Math.abs(Number(row.amount || 0));

    const record: DREOriginRecord = {
      id: `partner:${row.id}`,
      origin: "partner_transactions",
      sourceTable: "partner_transactions",
      sourceId: row.id,
      structureItemIds,
      subgroupId,
      subgroupName: product?.name,
      storeId: row.store_id,
      storeName: row.stores?.name || "Loja",
      value: signedValue,
      grossValue: Number(row.amount || 0),
      dateUsed: dateField,
      dateCriterion: filters.regime === "cash" ? "partner_payment" : "partner_competence",
      competenceDate: row.competence_date,
      paymentDate: row.payment_date,
      description: row.description || row.transaction_type,
      storeScopedKey: formatStoreScopedKey(row.store_id, monthKeyFromDate(dateField)),
      monthKey: monthKeyFromDate(dateField),
    };

    if (structureItemIds.length === 0) {
      unmappedRecords.push(record);
    } else {
      records.push(record);
    }
  });

  const { rows: stockRows, pages: stockPages, pageSize: stockPageSize } = await fetchAllPages<any>((from, to) =>
    supabase
      .from("stock_control")
      .select("id, store_id, month, year, total_value")
      .in("store_id", filters.storeIds)
      .eq("year", filters.year)
      .range(from, to),
  );
  queryStats.push({ label: "stock_control", pages: stockPages, records: stockRows.length, pageSize: stockPageSize });

  const stockLookup = new Map<string, any>();
  stockRows.forEach((row) => {
    stockLookup.set(`${row.store_id}:${row.year}-${String(row.month).padStart(2, "0")}`, row);
  });

  filters.storeIds.forEach((storeId) => {
    normalizeMonths(filters.months).forEach((month) => {
      const finalMonthKey = `${filters.year}-${String(month).padStart(2, "0")}`;
      const finalStock = stockLookup.get(`${storeId}:${finalMonthKey}`);
      if (finalStock) {
        const finalItems = structure.items.filter((item) => item.itemType === "final_stock");
        finalItems.forEach((item) => {
          records.push({
            id: `stock-final:${finalStock.id}:${item.id}`,
            origin: "stock_control",
            sourceTable: "stock_control",
            sourceId: finalStock.id,
            structureItemIds: [item.id],
            storeId,
            storeName: "",
            value: Number(finalStock.total_value || 0),
            grossValue: Number(finalStock.total_value || 0),
            dateUsed: `${filters.year}-${String(month).padStart(2, "0")}-01`,
            dateCriterion: "stock_snapshot",
            storeScopedKey: formatStoreScopedKey(storeId, finalMonthKey),
            monthKey: finalMonthKey,
            description: "Estoque final",
          });
        });
      }

      const previousMonth = month === 1 ? 12 : month - 1;
      const previousYear = month === 1 ? filters.year - 1 : filters.year;
      const initialMonthKey = `${previousYear}-${String(previousMonth).padStart(2, "0")}`;
      const initialStock = stockLookup.get(`${storeId}:${initialMonthKey}`);
      if (initialStock) {
        const initialItems = structure.items.filter((item) => item.itemType === "initial_stock");
        initialItems.forEach((item) => {
          records.push({
            id: `stock-initial:${initialStock.id}:${item.id}:${month}`,
            origin: "stock_control",
            sourceTable: "stock_control",
            sourceId: initialStock.id,
            structureItemIds: [item.id],
            storeId,
            storeName: "",
            value: Number(initialStock.total_value || 0),
            grossValue: Number(initialStock.total_value || 0),
            dateUsed: `${filters.year}-${String(month).padStart(2, "0")}-01`,
            dateCriterion: "stock_snapshot",
            storeScopedKey: formatStoreScopedKey(storeId, `${filters.year}-${String(month).padStart(2, "0")}`),
            monthKey: `${filters.year}-${String(month).padStart(2, "0")}`,
            description: "Estoque inicial",
          });
        });
      }
    });
  });

  const filteredRecords = records.filter((record) => monthKeys.includes(record.monthKey));
  const filteredUnmapped = unmappedRecords.filter((record) => monthKeys.includes(record.monthKey));

  return {
    records: filteredRecords,
    unmappedRecords: filteredUnmapped,
    queryStats,
  };
}

function buildLineResults(
  filters: DREFilters,
  structure: Awaited<ReturnType<typeof fetchStructureDefinition>>,
  records: DREOriginRecord[],
  columns: Array<{ id: string }>,
): { lineResults: DRELineResult[]; auditByLineId: Record<string, DREAuditEntry> } {
  const lineResults: DRELineResult[] = [];
  const auditByLineId: Record<string, DREAuditEntry> = {};

  const directRecordIdsByItemId = structure.items.reduce<Record<string, string[]>>((accumulator, item) => {
    accumulator[item.id] = [];
    return accumulator;
  }, {});

  const directRecordsByItemId = structure.items.reduce<Record<string, DREOriginRecord[]>>((accumulator, item) => {
    accumulator[item.id] = [];
    return accumulator;
  }, {});

  records.forEach((record) => {
    record.structureItemIds.forEach((itemId) => {
      directRecordIdsByItemId[itemId] = directRecordIdsByItemId[itemId] || [];
      directRecordIdsByItemId[itemId].push(record.id);
      directRecordsByItemId[itemId] = directRecordsByItemId[itemId] || [];
      directRecordsByItemId[itemId].push(record);
    });
  });

  const lineMap = new Map<string, DRELineResult>();
  const previousLineIds: string[] = [];

  structure.items.forEach((item, index) => {
    const valuesByColumn = createValueBucket(columns);
    let contributingRecords = [...(directRecordsByItemId[item.id] || [])];

    if (item.itemType === "group") {
      const descendants = structure.items
        .slice(index + 1)
        .filter((candidate) => candidate.groupId === item.id && candidate.itemType !== "group" && candidate.itemType !== "sum_line");
      contributingRecords = descendants.flatMap((candidate) => directRecordsByItemId[candidate.id] || []);
    }

    if (item.itemType === "sum_line") {
      const referencedIds = item.sumItems.length > 0 ? item.sumItems : previousLineIds;
      contributingRecords = referencedIds.flatMap((lineId) => {
        const referenceLine = lineMap.get(lineId);
        return referenceLine ? referenceLine.auditRecordIds.map((recordId) => records.find((record) => record.id === recordId)).filter(Boolean) as DREOriginRecord[] : [];
      });
    }

    contributingRecords.forEach((record) => addRecordToColumn(valuesByColumn, record, filters));

    const total = Object.values(valuesByColumn).reduce((sum, value) => sum + value, 0);
    const line: DRELineResult = {
      item,
      isExpandable: item.itemType !== "sum_line",
      auditRecordIds: [...new Set(contributingRecords.map((record) => record.id))],
      valuesByColumn,
      total,
    };

    lineResults.push(line);
    lineMap.set(item.id, line);
    previousLineIds.push(item.id);

    auditByLineId[item.id] = {
      id: item.id,
      lineId: item.id,
      lineName: item.name,
      records: contributingRecords,
      total,
      filters,
    };
  });

  return { lineResults, auditByLineId };
}

function buildValidations(
  result: Pick<DREApuracaoResult, "lineResults" | "columns" | "records" | "filters" | "unmappedRecords">,
): DREValidationResult[] {
  const validations: DREValidationResult[] = [];

  const duplicatedIds = result.records.map((record) => record.id).filter((value, index, collection) => collection.indexOf(value) !== index);
  validations.push({
    code: "NO_DUPLICATED_RECORDS",
    status: duplicatedIds.length === 0 ? "ok" : "error",
    message: duplicatedIds.length === 0 ? "Nenhum lançamento duplicado foi detectado." : "Há lançamentos duplicados na apuração.",
    details: duplicatedIds.slice(0, 10).join(", "),
  });

  validations.push({
    code: "NO_UNMAPPED_ELIGIBLE_RECORDS",
    status: result.unmappedRecords.length === 0 ? "ok" : "warning",
    message:
      result.unmappedRecords.length === 0
        ? "Todos os lançamentos elegíveis encontraram vínculo com a estrutura."
        : `${result.unmappedRecords.length} lançamento(s) elegível(is) ficaram sem vínculo com a estrutura.`,
  });

  const groupedTotals = result.columns.reduce<Record<string, number>>((accumulator, column) => {
    accumulator[column.id] = result.lineResults.reduce((sum, line) => sum + (line.valuesByColumn[column.id] || 0), 0);
    return accumulator;
  }, {});
  const anyNaN = Object.values(groupedTotals).some((value) => Number.isNaN(value));
  validations.push({
    code: "COLUMN_TOTALS_ARE_NUMERIC",
    status: anyNaN ? "error" : "ok",
    message: anyNaN ? "Há colunas com total inválido." : "Todas as colunas possuem totais numéricos válidos.",
  });

  validations.push({
    code: "EMPTY_STORE_FILTER_MEANS_ALL",
    status: result.filters.storeIds.length > 0 ? "ok" : "warning",
    message:
      result.filters.storeIds.length > 0
        ? "O filtro de lojas foi resolvido corretamente."
        : "Nenhuma loja foi selecionada explicitamente; o módulo deverá considerar todas as lojas acessíveis.",
  });

  return validations;
}

export async function apurarDRE(filters: DREFilters): Promise<DREApuracaoResult> {
  const startedAt = Date.now();
  const normalizedFilters: DREFilters = {
    ...filters,
    months: normalizeMonths(filters.months),
  };

  const structure = await fetchStructureDefinition(normalizedFilters.structureId);
  const storeNameMap = normalizedFilters.storeIds.reduce<Record<string, string>>((accumulator, storeId) => {
    accumulator[storeId] = storeId;
    return accumulator;
  }, {});

  const { records, unmappedRecords, queryStats } = await buildOriginRecords(normalizedFilters, structure);
  records.forEach((record) => {
    if (!storeNameMap[record.storeId]) {
      storeNameMap[record.storeId] = record.storeName || record.storeId;
    }
  });
  const enrichedColumns = buildColumns(normalizedFilters, storeNameMap);
  const { lineResults, auditByLineId } = buildLineResults(normalizedFilters, structure, records, enrichedColumns);
  const summaryCards = inferSummaryCards({ lineResults });
  const validations = buildValidations({
    lineResults,
    columns: enrichedColumns,
    records,
    filters: normalizedFilters,
    unmappedRecords,
  });

  return {
    filters: normalizedFilters,
    structure,
    records,
    unmappedRecords,
    lineResults,
    visibleLineIdsByMode: {
      synthetic: lineResults.filter((line) => line.item.itemType !== "subgroup").map((line) => line.item.id),
      analytic: lineResults.map((line) => line.item.id),
    },
    summaryCards,
    diagnostics: {
      originCounters: buildDiagnosticCounters(records, (record) => record.origin),
      storeCounters: buildDiagnosticCounters(records, (record) => record.storeName || record.storeId),
      periodCounters: buildDiagnosticCounters(records, (record) => record.monthKey),
      findings: [...structure.findings],
      validations,
      queryStats,
      executionTimeMs: Date.now() - startedAt,
    },
    columns: enrichedColumns,
    auditByLineId,
  };
}
