import type { DREStoreOption, DREStructureDefinition, DREStructureItem } from "@/modules/dre-v2/types";
import { fetchAllPages, safeMaybeSingle, supabase } from "@/modules/dre-v2/services/paginatedSupabase";

export async function fetchAccessibleStores(): Promise<DREStoreOption[]> {
  const auth = await supabase.auth.getUser();
  const user = auth.data.user;

  if (!user) {
    return [];
  }

  const profile = await safeMaybeSingle(
    supabase.from("profiles").select("role, store_id").eq("id", user.id).single(),
  );

  if (profile?.role === "admin") {
    const { data, error } = await supabase.from("stores").select("id, name").order("name");
    if (error) {
      throw error;
    }
    return data || [];
  }

  const storeIds = new Set<string>();
  if (profile?.store_id) {
    storeIds.add(profile.store_id);
  }

  const { data: userStores, error: userStoreError } = await supabase
    .from("user_stores")
    .select("store_id")
    .eq("user_id", user.id);

  if (userStoreError) {
    throw userStoreError;
  }

  (userStores || []).forEach((item) => {
    if (item.store_id) {
      storeIds.add(item.store_id);
    }
  });

  if (storeIds.size === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("stores")
    .select("id, name")
    .in("id", Array.from(storeIds))
    .order("name");

  if (error) {
    throw error;
  }

  return data || [];
}

export async function fetchBrandStructures(brandId: string | null): Promise<Array<{ id: string; name: string }>> {
  let query = supabase.from("dre_structures").select("id, name").eq("is_active", true).order("name");

  if (brandId) {
    query = query.eq("brand_id", brandId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return data || [];
}

export async function fetchStructureDefinition(structureId: string): Promise<DREStructureDefinition> {
  const { rows } = await fetchAllPages<any>((from, to) =>
    supabase
      .from("dre_structure_items")
      .select("id, structure_id, item_type, account_group_id, parent_id, name, description, operation_type, position_order, sum_items")
      .eq("structure_id", structureId)
      .order("position_order")
      .range(from, to),
  );

  const items: DREStructureItem[] = [];
  const findings: DREStructureDefinition["findings"] = [];
  const subgroupToItems: Record<string, string[]> = {};
  let currentGroupId: string | null = null;
  let currentGroupName: string | null = null;

  rows.forEach((row) => {
    const item: DREStructureItem = {
      id: row.id,
      structureId: row.structure_id,
      name: row.name,
      description: row.description,
      itemType: row.item_type,
      operationType: row.operation_type,
      positionOrder: row.position_order,
      accountGroupId: row.account_group_id,
      parentId: row.parent_id,
      sumItems: Array.isArray(row.sum_items) ? row.sum_items : [],
      level: row.item_type === "group" || row.item_type === "sum_line" ? 0 : 1,
      groupId: currentGroupId,
      groupName: currentGroupName,
    };

    if (row.item_type === "group") {
      currentGroupId = row.id;
      currentGroupName = row.name;
      item.groupId = row.id;
      item.groupName = row.name;
      item.level = 0;
    } else if (row.item_type === "subgroup" || row.item_type === "initial_stock" || row.item_type === "final_stock") {
      item.groupId = currentGroupId;
      item.groupName = currentGroupName;
      item.level = 1;

      if (!currentGroupId) {
        findings.push({
          severity: "warning",
          code: "SUBGROUP_WITHOUT_GROUP",
          message: `A linha "${row.name}" aparece sem um grupo anterior na estrutura.`,
          itemId: row.id,
        });
      }
    }

    if (row.item_type === "subgroup" && row.account_group_id) {
      subgroupToItems[row.account_group_id] = subgroupToItems[row.account_group_id] || [];
      subgroupToItems[row.account_group_id].push(row.id);
    }

    if (row.item_type === "sum_line" && (!row.sum_items || row.sum_items.length === 0)) {
      findings.push({
        severity: "warning",
        code: "SUM_LINE_WITHOUT_REFERENCES",
        message: `A linha de soma "${row.name}" não possui referências explícitas e depende da ordem visual.`,
        itemId: row.id,
      });
    }

    if (row.parent_id && !rows.find((candidate) => candidate.id === row.parent_id)) {
      findings.push({
        severity: "warning",
        code: "BROKEN_PARENT_REFERENCE",
        message: `A linha "${row.name}" referencia um pai inexistente.`,
        itemId: row.id,
      });
    }

    items.push(item);
  });

  Object.entries(subgroupToItems).forEach(([subgroupId, itemIds]) => {
    if (itemIds.length > 1) {
      findings.push({
        severity: "error",
        code: "DUPLICATE_SUBGROUP_MAPPING",
        message: `O subgrupo ${subgroupId} está vinculado a mais de uma linha da estrutura.`,
        metadata: { subgroupId, itemIds },
      });
    }
  });

  const structure = await safeMaybeSingle(
    supabase.from("dre_structures").select("id, name").eq("id", structureId).single(),
  );

  return {
    id: structure?.id || structureId,
    name: structure?.name || "Estrutura DRE",
    items,
    findings,
    subgroupToItems,
  };
}
