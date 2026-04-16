import type { DREAccountOption } from "@/modules/dre-v2/types";
import { fetchAllPages, supabase } from "@/modules/dre-v2/services/paginatedSupabase";
import { buildAccountOption } from "@/modules/dre-v2/utils";

type StoreLinkTable =
  | "cash_account_stores"
  | "card_account_stores"
  | "current_account_stores"
  | "delivery_account_stores";

type AccountTable =
  | "cash_accounts"
  | "card_accounts"
  | "current_accounts"
  | "delivery_accounts";

async function fetchLinkedAccountIds(table: StoreLinkTable, storeIds: string[]): Promise<string[]> {
  const { rows } = await fetchAllPages<{ account_id: string }>((from, to) =>
    supabase
      .from(table)
      .select("account_id")
      .in("store_id", storeIds)
      .range(from, to),
  );

  return [...new Set(rows.map((row) => row.account_id).filter(Boolean))];
}

async function fetchNamedAccounts(table: AccountTable, ids: string[]): Promise<Array<{ id: string; name: string }>> {
  if (ids.length === 0) {
    return [];
  }

  const { rows } = await fetchAllPages<{ id: string; name: string }>((from, to) =>
    supabase
      .from(table)
      .select("id, name")
      .eq("is_active", true)
      .in("id", ids)
      .range(from, to),
  );

  return rows;
}

export async function fetchAccountsForStores(storeIds: string[]): Promise<DREAccountOption[]> {
  if (storeIds.length === 0) {
    return [];
  }

  const [cashIds, cardIds, currentIds, deliveryIds] = await Promise.all([
    fetchLinkedAccountIds("cash_account_stores", storeIds),
    fetchLinkedAccountIds("card_account_stores", storeIds),
    fetchLinkedAccountIds("current_account_stores", storeIds),
    fetchLinkedAccountIds("delivery_account_stores", storeIds),
  ]);

  const [cashAccounts, cardAccounts, currentAccounts, deliveryAccounts] = await Promise.all([
    fetchNamedAccounts("cash_accounts", cashIds),
    fetchNamedAccounts("card_accounts", cardIds),
    fetchNamedAccounts("current_accounts", currentIds),
    fetchNamedAccounts("delivery_accounts", deliveryIds),
  ]);

  return [
    ...cashAccounts.map((account) => buildAccountOption("cash", account.id, account.name)),
    ...cardAccounts.map((account) => buildAccountOption("card", account.id, account.name)),
    ...currentAccounts.map((account) => buildAccountOption("current", account.id, account.name)),
    ...deliveryAccounts.map((account) => buildAccountOption("delivery", account.id, account.name)),
  ].sort((left, right) => left.label.localeCompare(right.label, "pt-BR"));
}
