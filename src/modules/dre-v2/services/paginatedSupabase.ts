import { supabase } from "@/integrations/supabase/client";

export interface PaginatedQueryResult<T> {
  rows: T[];
  pages: number;
  pageSize: number;
}

export async function fetchAllPages<T>(
  buildQuery: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>,
  pageSize = 1000,
): Promise<PaginatedQueryResult<T>> {
  const rows: T[] = [];
  let from = 0;
  let pages = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery(from, to);

    if (error) {
      throw error;
    }

    const pageRows = data || [];
    rows.push(...pageRows);
    pages += 1;

    if (pageRows.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return {
    rows,
    pages,
    pageSize,
  };
}

export async function safeMaybeSingle<T>(promise: Promise<{ data: T | null; error: any }>): Promise<T | null> {
  const { data, error } = await promise;
  if (error) {
    return null;
  }
  return data;
}

export { supabase };
