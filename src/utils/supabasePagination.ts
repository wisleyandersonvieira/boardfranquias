import { supabase } from "@/integrations/supabase/client";

/**
 * Busca todas as linhas de uma tabela paginando em lotes de `pageSize` (default 1000)
 * para contornar o limite default de 1000 do Supabase.
 *
 * Uso:
 *   const data = await fetchAllPaginated((from, to) =>
 *     supabase.from("products").select("id, name").eq("is_active", true).order("name").range(from, to)
 *   );
 */
export async function fetchAllPaginated<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize: number = 1000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // Loop until we get a page smaller than pageSize
  // (or empty), which signals we have everything.
  // Safety cap to avoid infinite loops.
  for (let i = 0; i < 1000; i++) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw error;
    const batch = data || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return all;
}