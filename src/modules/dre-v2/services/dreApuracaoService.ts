import type {
  DREApuracaoResult,
  DREAuditEntry,
  DREDiagnosticCounter,
  DREFinancialAccountType,
  DREFilters,
  DRELineResult,
  DREOriginRecord,
  DREValidationResult,
} from "@/modules/dre-v2/types";
import { fetchStructureDefinition } from "@/modules/dre-v2/services/dreStructureAuditService";
import { fetchAllPages, supabase } from "@/modules/dre-v2/services/paginatedSupabase";
import {
  buildAccountFilterKey,
  buildColumnId,
  DRE_MONTHS,
  getFriendlyOriginLabel,
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

function buildSelectedAccountKeys(filters: DREFilters): Set<string> {
  return new Set((filters.accountFilters || []).map((account) => account.key));
}

function buildSelectedAccountIds(filters: DREFilters): string[] {
  return [...new Set((filters.accountFilters || []).map((account) => account.id).filter(Boolean))];
}

function normalizeFinancialAccountType(value?: string | null): DREFinancialAccountType | null {
  switch (value) {
    case "current":
    case "cash":
    case "card":
    case "delivery":
      return value;
    default:
      return null;
  }
}

function matchesSelectedFinancialAccount(
  selectedAccountKeys: Set<string>,
  accountId?: string | null,
  accountType?: string | null,
): boolean {
  if (selectedAccountKeys.size === 0) {
    return true;
  }

  const normalizedType = normalizeFinancialAccountType(accountType);
  if (!accountId || !normalizedType) {
    return false;
  }

  return selectedAccountKeys.has(buildAccountFilterKey(normalizedType, accountId));
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
  const selectedAccountKeys = buildSelectedAccountKeys(filters);
  const selectedAccountIds = buildSelectedAccountIds(filters);
  const shouldLoadAllPaymentsForAccountFilter = selectedAccountKeys.size > 0 && filters.regime === "competence";
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
      .select(`
        id,
        store_id,
        date,
        faturamento_dinheiro,
        faturamento_cartao,
        faturamento_conta,
        faturamento_delivery,
        stores(name),
        cash_control_cash_items (
          id,
          valor,
          cash_account_id,
          cash_accounts (name)
        ),
        cash_control_card_items (
          id,
          valor,
          card_account_id,
          card_accounts (name)
        ),
        cash_control_account_items (
          id,
          valor,
          current_account_id,
          current_accounts (name)
        ),
        cash_control_delivery_items (
          id,
          valor,
          delivery_account_id,
          delivery_accounts (name)
        )
      `)
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

    const pushCashRecord = (
      parameterKey: "venda_dinheiro" | "venda_cartao" | "venda_contas" | "venda_delivery",
      amount: number,
      suffix: string,
      accountType?: DREFinancialAccountType,
      accountId?: string | null,
      accountName?: string | null,
    ) => {
      if (!amount) {
        return;
      }

      if (!matchesSelectedFinancialAccount(selectedAccountKeys, accountId, accountType)) {
        return;
      }

      const subgroupId = parameterSubgroups[parameterKey];
      const structureItemIds = subgroupId ? structure.subgroupToItems[subgroupId] || [] : [];
      const record: DREOriginRecord = {
        id: `cash:${row.id}:${parameterKey}:${suffix}`,
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
        friendlyOrigin: getFriendlyOriginLabel("cash_control"),
        categoryLabel: `Faturamento ${parameterKey.replace("venda_", "")}`,
        storeScopedKey: formatStoreScopedKey(row.store_id, monthKeyFromDate(row.date)),
        monthKey: monthKeyFromDate(row.date),
        description: `Faturamento ${parameterKey.replace("venda_", "")}`,
        metadata: accountId && accountType ? { accountId, accountType, accountName } : undefined,
      };

      if (structureItemIds.length === 0) {
        unmappedRecords.push(record);
      } else {
        records.push(record);
      }
    };

    const cashItems = row.cash_control_cash_items || [];
    const cardItems = row.cash_control_card_items || [];
    const currentItems = row.cash_control_account_items || [];
    const deliveryItems = row.cash_control_delivery_items || [];

    if (cashItems.length > 0) {
      cashItems.forEach((item: any) => {
        pushCashRecord("venda_dinheiro", Number(item.valor || 0), item.id || item.cash_account_id, "cash", item.cash_account_id, item.cash_accounts?.name);
      });
    } else if (selectedAccountKeys.size === 0) {
      pushCashRecord("venda_dinheiro", Number(row.faturamento_dinheiro || 0), "legacy");
    }

    if (cardItems.length > 0) {
      cardItems.forEach((item: any) => {
        pushCashRecord("venda_cartao", Number(item.valor || 0), item.id || item.card_account_id, "card", item.card_account_id, item.card_accounts?.name);
      });
    } else if (selectedAccountKeys.size === 0) {
      pushCashRecord("venda_cartao", Number(row.faturamento_cartao || 0), "legacy");
    }

    if (currentItems.length > 0) {
      currentItems.forEach((item: any) => {
        pushCashRecord(
          "venda_contas",
          Number(item.valor || 0),
          item.id || item.current_account_id,
          "current",
          item.current_account_id,
          item.current_accounts?.name,
        );
      });
    } else if (selectedAccountKeys.size === 0) {
      pushCashRecord("venda_contas", Number(row.faturamento_conta || 0), "legacy");
    }

    if (deliveryItems.length > 0) {
      deliveryItems.forEach((item: any) => {
        pushCashRecord(
          "venda_delivery",
          Number(item.valor || 0),
          item.id || item.delivery_account_id,
          "delivery",
          item.delivery_account_id,
          item.delivery_accounts?.name,
        );
      });
    } else if (selectedAccountKeys.size === 0) {
      pushCashRecord("venda_delivery", Number(row.faturamento_delivery || 0), "legacy");
    }
  });

  const { rows: payablePayments, pages: payablePaymentPages, pageSize: payablePaymentPageSize } = await fetchAllPages<any>((from, to) =>
    {
      const query = supabase
        .from("accounts_payable_payments")
        .select("id, installment_id, account_payable_id, payment_date, amount_paid, interest_amount, discount_amount, interest_product_id, discount_product_id, payment_account_id, payment_account_type");

      if (shouldLoadAllPaymentsForAccountFilter) {
        return query
          .in("payment_account_id", selectedAccountIds)
          .range(from, to);
      }

      return query
        .gte("payment_date", yearStart)
        .lte("payment_date", yearEnd)
        .range(from, to);
    },
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
        suppliers(name),
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
    const allPayments = (account.accounts_payable_installments || []).flatMap(
      (installment: any) => payablePaymentsByInstallment[installment.id] || [],
    );
    const matchedPayments = selectedAccountKeys.size > 0
      ? allPayments.filter((payment: any) =>
          matchesSelectedFinancialAccount(selectedAccountKeys, payment.payment_account_id, payment.payment_account_type),
        )
      : allPayments;

    const pushItemRecord = (
      item: any,
      amount: number,
      dateUsed: string,
      dateCriterion: DREOriginRecord["dateCriterion"],
      suffix: string,
      grossValue = amount,
      metadata?: Record<string, unknown>,
    ) => {
      if (!amount) {
        return;
      }

      const subgroupId = item.products?.subgroup_id || null;
      const structureItemIds = subgroupId ? structure.subgroupToItems[subgroupId] || [] : [];
      const functionType = item.products?.function_type || "debit";
      const signedValue = functionType === "debit" ? -amount : amount;
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
        categoryLabel: item.products?.name || null,
        paymentStatus: account.status,
        supplierName: account.suppliers?.name || null,
        friendlyOrigin: getFriendlyOriginLabel("accounts_payable"),
        storeScopedKey: formatStoreScopedKey(account.store_id, monthKeyFromDate(dateUsed)),
        monthKey: monthKeyFromDate(dateUsed),
        metadata,
      };

      if (structureItemIds.length === 0) {
        unmappedRecords.push(record);
      } else {
        records.push(record);
      }
    };

    if (filters.regime === "competence" && isDateInsideFilters(account.data_competencia, filters, "competence")) {
      if (selectedAccountKeys.size > 0) {
        const matchedAmount = matchedPayments.reduce((sum: number, payment: any) => sum + Number(payment.amount_paid || 0), 0);
        const proportion = baseAmount > 0 ? Math.min(matchedAmount / baseAmount, 1) : matchedPayments.length > 0 ? 1 : 0;

        normalItems.forEach((item: any) => {
          pushItemRecord(
            item,
            Number(item.total_price || 0) * proportion,
            account.data_competencia,
            "competence",
            "competence-account-filter",
          );
        });
      } else {
        normalItems.forEach((item: any) => {
          pushItemRecord(item, Number(item.total_price || 0), account.data_competencia, "competence", "competence");
        });
      }
    }

    const installments = account.accounts_payable_installments || [];
    if (filters.regime === "cash") {
      if (installments.length > 0) {
        installments.forEach((installment: any) => {
          if (!isDateInsideFilters(installment.payment_date, filters, "payment")) {
            return;
          }

          const payments = payablePaymentsByInstallment[installment.id] || [];
          if (payments.length > 0) {
            const effectivePayments = selectedAccountKeys.size > 0
              ? payments.filter((payment: any) =>
                  matchesSelectedFinancialAccount(selectedAccountKeys, payment.payment_account_id, payment.payment_account_type),
                )
              : payments;

            effectivePayments.forEach((payment: any) => {
              const paymentMetadata = payment.payment_account_id && payment.payment_account_type
                ? {
                    accountId: payment.payment_account_id,
                    accountType: payment.payment_account_type,
                  }
                : undefined;
              const proportion = baseAmount > 0
                ? Number(payment.amount_paid || 0) / baseAmount
                : 1 / Math.max(effectivePayments.length, 1);

              normalItems.forEach((item: any) => {
                pushItemRecord(
                  item,
                  Number(item.total_price || 0) * proportion,
                  payment.payment_date,
                  "payment",
                  `cash:${installment.id}:${payment.id}`,
                  Number(item.total_price || 0) * proportion,
                  paymentMetadata,
                );
              });

              adjustmentItems.forEach((item: any) => {
                if (item.product_id === payment.interest_product_id && payment.interest_amount > 0) {
                  pushItemRecord(
                    item,
                    Number(payment.interest_amount || 0),
                    payment.payment_date,
                    "payment",
                    `interest:${payment.id}`,
                    Number(payment.interest_amount || 0),
                    paymentMetadata,
                  );
                }
                if (item.product_id === payment.discount_product_id && payment.discount_amount > 0) {
                  pushItemRecord(
                    item,
                    Number(payment.discount_amount || 0),
                    payment.payment_date,
                    "payment",
                    `discount:${payment.id}`,
                    Number(payment.discount_amount || 0),
                    paymentMetadata,
                  );
                }
              });
            });
          } else {
            if (selectedAccountKeys.size > 0) {
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

            adjustmentItems.forEach((item: any) => {
              pushItemRecord(
                item,
                Number(item.total_price || 0) / Math.max(installments.filter((entry: any) => entry.payment_date).length, 1),
                installment.payment_date,
                "payment",
                `legacy-adjustment:${installment.id}`,
              );
            });
          }
        });
      } else if (isDateInsideFilters(account.payment_date, filters, "payment")) {
        if (selectedAccountKeys.size > 0) {
          return;
        }

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
        if (payments.length > 0) {
          const effectivePayments = selectedAccountKeys.size > 0
            ? payments.filter((payment: any) =>
                matchesSelectedFinancialAccount(selectedAccountKeys, payment.payment_account_id, payment.payment_account_type),
              )
            : payments;

          effectivePayments.forEach((payment: any) => {
            const paymentMetadata = payment.payment_account_id && payment.payment_account_type
              ? {
                  accountId: payment.payment_account_id,
                  accountType: payment.payment_account_type,
                }
              : undefined;
            adjustmentItems.forEach((item: any) => {
              if (item.product_id === payment.interest_product_id && payment.interest_amount > 0) {
                pushItemRecord(
                  item,
                  Number(payment.interest_amount || 0),
                  payment.payment_date,
                  "payment",
                  `interest:${payment.id}`,
                  Number(payment.interest_amount || 0),
                  paymentMetadata,
                );
              }
              if (item.product_id === payment.discount_product_id && payment.discount_amount > 0) {
                pushItemRecord(
                  item,
                  Number(payment.discount_amount || 0),
                  payment.payment_date,
                  "payment",
                  `discount:${payment.id}`,
                  Number(payment.discount_amount || 0),
                  paymentMetadata,
                );
              }
            });
          });
        } else {
          if (selectedAccountKeys.size > 0) {
            return;
          }

          const paidInstallmentsCount = Math.max(installments.filter((entry: any) => entry.payment_date).length, 1);
          adjustmentItems.forEach((item: any) => {
            pushItemRecord(
              item,
              Number(item.total_price || 0) / paidInstallmentsCount,
              installment.payment_date,
              "payment",
              `legacy-adjustment:${installment.id}`,
            );
          });
        }
      });
    }
  });

  const { rows: receivablePayments, pages: receivablePaymentPages, pageSize: receivablePaymentPageSize } = await fetchAllPages<any>((from, to) =>
    {
      const query = supabase
        .from("accounts_receivable_payments")
        .select("id, installment_id, account_receivable_id, payment_date, amount_paid, interest_amount, discount_amount, interest_product_id, discount_product_id, payment_account_id, payment_account_type");

      if (shouldLoadAllPaymentsForAccountFilter) {
        return query
          .in("payment_account_id", selectedAccountIds)
          .range(from, to);
      }

      return query
        .gte("payment_date", yearStart)
        .lte("payment_date", yearEnd)
        .range(from, to);
    },
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
        creditors(name),
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
    const allPayments = (account.accounts_receivable_installments || []).flatMap(
      (installment: any) => receivablePaymentsByInstallment[installment.id] || [],
    );
    const matchedPayments = selectedAccountKeys.size > 0
      ? allPayments.filter((payment: any) =>
          matchesSelectedFinancialAccount(selectedAccountKeys, payment.payment_account_id, payment.payment_account_type),
        )
      : allPayments;

    const pushItemRecord = (
      item: any,
      amount: number,
      dateUsed: string,
      dateCriterion: DREOriginRecord["dateCriterion"],
      suffix: string,
      grossValue = amount,
      metadata?: Record<string, unknown>,
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
        categoryLabel: item.products?.name || null,
        paymentStatus: account.status,
        supplierName: account.creditors?.name || null,
        friendlyOrigin: getFriendlyOriginLabel("accounts_receivable"),
        storeScopedKey: formatStoreScopedKey(account.store_id, monthKeyFromDate(dateUsed)),
        monthKey: monthKeyFromDate(dateUsed),
        metadata,
      };

      if (structureItemIds.length === 0) {
        unmappedRecords.push(record);
      } else {
        records.push(record);
      }
    };

    if (filters.regime === "competence" && isDateInsideFilters(account.data_competencia, filters, "competence")) {
      if (selectedAccountKeys.size > 0) {
        const matchedAmount = matchedPayments.reduce((sum: number, payment: any) => sum + Number(payment.amount_paid || 0), 0);
        const proportion = baseAmount > 0 ? Math.min(matchedAmount / baseAmount, 1) : matchedPayments.length > 0 ? 1 : 0;

        normalItems.forEach((item: any) => {
          pushItemRecord(
            item,
            Number(item.total_price || 0) * proportion,
            account.data_competencia,
            "competence",
            "competence-account-filter",
          );
        });
      } else {
        normalItems.forEach((item: any) => {
          pushItemRecord(item, Number(item.total_price || 0), account.data_competencia, "competence", "competence");
        });
      }
    }

    const installments = account.accounts_receivable_installments || [];
    if (filters.regime === "cash") {
      if (installments.length > 0) {
        installments.forEach((installment: any) => {
          if (!isDateInsideFilters(installment.payment_date, filters, "payment")) {
            return;
          }

          const payments = receivablePaymentsByInstallment[installment.id] || [];
          if (payments.length > 0) {
            const effectivePayments = selectedAccountKeys.size > 0
              ? payments.filter((payment: any) =>
                  matchesSelectedFinancialAccount(selectedAccountKeys, payment.payment_account_id, payment.payment_account_type),
                )
              : payments;

            effectivePayments.forEach((payment: any) => {
              const paymentMetadata = payment.payment_account_id && payment.payment_account_type
                ? {
                    accountId: payment.payment_account_id,
                    accountType: payment.payment_account_type,
                  }
                : undefined;
              const proportion = baseAmount > 0
                ? Number(payment.amount_paid || 0) / baseAmount
                : 1 / Math.max(effectivePayments.length, 1);

              normalItems.forEach((item: any) => {
                pushItemRecord(
                  item,
                  Number(item.total_price || 0) * proportion,
                  payment.payment_date,
                  "payment",
                  `cash:${installment.id}:${payment.id}`,
                  Number(item.total_price || 0) * proportion,
                  paymentMetadata,
                );
              });

              adjustmentItems.forEach((item: any) => {
                if (item.product_id === payment.interest_product_id && payment.interest_amount > 0) {
                  pushItemRecord(
                    item,
                    Number(payment.interest_amount || 0),
                    payment.payment_date,
                    "payment",
                    `interest:${payment.id}`,
                    Number(payment.interest_amount || 0),
                    paymentMetadata,
                  );
                }
                if (item.product_id === payment.discount_product_id && payment.discount_amount > 0) {
                  pushItemRecord(
                    item,
                    Number(payment.discount_amount || 0),
                    payment.payment_date,
                    "payment",
                    `discount:${payment.id}`,
                    Number(payment.discount_amount || 0),
                    paymentMetadata,
                  );
                }
              });
            });
          } else {
            if (selectedAccountKeys.size > 0) {
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
          }
        });
      } else if (isDateInsideFilters(account.payment_date, filters, "payment")) {
        if (selectedAccountKeys.size > 0) {
          return;
        }

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
        const effectivePayments = selectedAccountKeys.size > 0
          ? payments.filter((payment: any) =>
              matchesSelectedFinancialAccount(selectedAccountKeys, payment.payment_account_id, payment.payment_account_type),
            )
          : payments;

        effectivePayments.forEach((payment: any) => {
          const paymentMetadata = payment.payment_account_id && payment.payment_account_type
            ? {
                accountId: payment.payment_account_id,
                accountType: payment.payment_account_type,
              }
            : undefined;
          adjustmentItems.forEach((item: any) => {
            if (item.product_id === payment.interest_product_id && payment.interest_amount > 0) {
              pushItemRecord(
                item,
                Number(payment.interest_amount || 0),
                payment.payment_date,
                "payment",
                `interest:${payment.id}`,
                Number(payment.interest_amount || 0),
                paymentMetadata,
              );
            }
            if (item.product_id === payment.discount_product_id && payment.discount_amount > 0) {
              pushItemRecord(
                item,
                Number(payment.discount_amount || 0),
                payment.payment_date,
                "payment",
                `discount:${payment.id}`,
                Number(payment.discount_amount || 0),
                paymentMetadata,
              );
            }
          });
        });
      });
    }
  });

  const { rows: partnerRows, pages: partnerPages, pageSize: partnerPageSize } = await fetchAllPages<any>((from, to) =>
    supabase
      .from("partner_transactions")
      .select("id, store_id, payment_date, competence_date, amount, transaction_type, notes, account_id, account_type, stores(name)")
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

    if (!matchesSelectedFinancialAccount(selectedAccountKeys, row.account_id, row.account_type)) {
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
      description: row.notes || row.transaction_type,
      categoryLabel: product?.name || null,
      friendlyOrigin: getFriendlyOriginLabel("partner_transactions"),
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

  if (selectedAccountKeys.size > 0) {
    return {
      records: records.filter((record) => monthKeys.includes(record.monthKey)),
      unmappedRecords: unmappedRecords.filter((record) => monthKeys.includes(record.monthKey)),
      queryStats,
    };
  }

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
            friendlyOrigin: getFriendlyOriginLabel("stock_control"),
            categoryLabel: "Estoque final",
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
            friendlyOrigin: getFriendlyOriginLabel("stock_control"),
            categoryLabel: "Estoque inicial",
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
      const candidateIds = item.sumItems.length > 0 ? item.sumItems : previousLineIds;
      const referencedGroupIds = candidateIds.filter((lineId) => lineMap.get(lineId)?.item.itemType === "group");
      contributingRecords = [];

      referencedGroupIds.forEach((lineId) => {
        const referenceLine = lineMap.get(lineId);
        if (!referenceLine) {
          return;
        }

        columns.forEach((column) => {
          valuesByColumn[column.id] = (valuesByColumn[column.id] || 0) + (referenceLine.valuesByColumn[column.id] || 0);
        });
      });
    }
    else {
      contributingRecords.forEach((record) => addRecordToColumn(valuesByColumn, record, filters));
    }

    const total = Object.values(valuesByColumn).reduce((sum, value) => sum + value, 0);
    const line: DRELineResult = {
      item,
      isExpandable: item.itemType !== "sum_line",
      auditRecordIds: item.itemType === "sum_line" ? [] : [...new Set(contributingRecords.map((record) => record.id))],
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
      records: item.itemType === "sum_line" ? [] : contributingRecords,
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
    summaryCards: [],
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
