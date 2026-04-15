export type DRERegime = "competence" | "cash";
export type DREViewMode = "synthetic" | "analytic";

export interface DREStoreOption {
  id: string;
  name: string;
}

export interface DREFilters {
  structureId: string;
  regime: DRERegime;
  year: number;
  months: number[];
  storeIds: string[];
  groupByStore: boolean;
  competenceStart?: string;
  competenceEnd?: string;
  paymentStart?: string;
  paymentEnd?: string;
}

export interface DREStructureItem {
  id: string;
  structureId: string;
  name: string;
  description?: string | null;
  itemType: "group" | "subgroup" | "sum_line" | "initial_stock" | "final_stock" | string;
  operationType: "credit" | "debit";
  positionOrder: number;
  accountGroupId?: string | null;
  parentId?: string | null;
  sumItems: string[];
  level: number;
  groupId?: string | null;
  groupName?: string | null;
}

export interface DREStructureAuditFinding {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  itemId?: string;
  metadata?: Record<string, unknown>;
}

export interface DREStructureDefinition {
  id: string;
  name: string;
  items: DREStructureItem[];
  findings: DREStructureAuditFinding[];
  subgroupToItems: Record<string, string[]>;
}

export interface DREOriginRecord {
  id: string;
  origin:
    | "cash_control"
    | "accounts_payable"
    | "accounts_receivable"
    | "partner_transactions"
    | "stock_control";
  sourceTable: string;
  sourceId: string;
  sourceDetailId?: string;
  structureItemIds: string[];
  subgroupId?: string | null;
  subgroupName?: string | null;
  storeId: string;
  storeName: string;
  value: number;
  grossValue: number;
  dateUsed: string;
  dateCriterion:
    | "competence"
    | "payment"
    | "cash_control_date"
    | "partner_competence"
    | "partner_payment"
    | "stock_snapshot";
  competenceDate?: string | null;
  paymentDate?: string | null;
  dueDate?: string | null;
  documentNumber?: string | null;
  description?: string | null;
  categoryLabel?: string | null;
  paymentStatus?: string | null;
  storeScopedKey: string;
  monthKey: string;
  metadata?: Record<string, unknown>;
}

export interface DREDiagnosticCounter {
  label: string;
  count: number;
  amount: number;
}

export interface DREValidationResult {
  code: string;
  status: "ok" | "warning" | "error";
  message: string;
  details?: string;
}

export interface DRELineResult {
  item: DREStructureItem;
  isExpandable: boolean;
  auditRecordIds: string[];
  valuesByColumn: Record<string, number>;
  total: number;
}

export interface DRESummaryCard {
  id: string;
  label: string;
  value: number;
  percent?: number | null;
}

export interface DREAuditEntry {
  id: string;
  lineId: string;
  lineName: string;
  records: DREOriginRecord[];
  total: number;
  filters: DREFilters;
}

export interface DREApuracaoResult {
  filters: DREFilters;
  structure: DREStructureDefinition;
  records: DREOriginRecord[];
  unmappedRecords: DREOriginRecord[];
  lineResults: DRELineResult[];
  visibleLineIdsByMode: Record<DREViewMode, string[]>;
  summaryCards: DRESummaryCard[];
  diagnostics: {
    originCounters: DREDiagnosticCounter[];
    storeCounters: DREDiagnosticCounter[];
    periodCounters: DREDiagnosticCounter[];
    findings: DREStructureAuditFinding[];
    validations: DREValidationResult[];
    queryStats: Array<{
      label: string;
      pages: number;
      records: number;
      pageSize: number;
    }>;
    executionTimeMs: number;
  };
  columns: Array<{
    id: string;
    label: string;
    month: number;
    year: number;
    storeId?: string;
    storeName?: string;
  }>;
  auditByLineId: Record<string, DREAuditEntry>;
}
