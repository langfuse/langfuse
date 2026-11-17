import type { GatewayUserSpendRow } from "@/src/features/ai-gateway/components/GatewayBudgetsPage/hooks/useGatewayUserSpend";

/** One page of the users whose name or email contains the search query, case-insensitively. */
export function selectGatewayUserSpendPage(
  rows: readonly GatewayUserSpendRow[],
  {
    searchQuery,
    pageIndex,
    pageSize,
  }: { searchQuery: string; pageIndex: number; pageSize: number },
): { rows: GatewayUserSpendRow[]; totalCount: number } {
  const needle = searchQuery.trim().toLowerCase();
  const matches =
    needle.length === 0
      ? rows
      : rows.filter(
          (row) =>
            row.name.toLowerCase().includes(needle) ||
            (row.email?.toLowerCase().includes(needle) ?? false),
        );
  const start = pageIndex * pageSize;
  return {
    rows: matches.slice(start, start + pageSize),
    totalCount: matches.length,
  };
}
