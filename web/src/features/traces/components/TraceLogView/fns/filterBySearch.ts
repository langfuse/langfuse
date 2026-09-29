import type { FlatLogItem } from "@/src/features/traces/components/TraceLogView/log-view-types";

/**
 * Filters log items by search query.
 * Matches against observation name and type (case-insensitive).
 *
 * @param items - List of FlatLogItem to filter
 * @param query - Search query string
 * @returns Filtered list of items matching the query
 */
export function filterBySearch(
  items: FlatLogItem[],
  query: string,
): FlatLogItem[] {
  if (!query.trim()) {
    return items;
  }

  const lowerQuery = query.toLowerCase().trim();

  return items.filter((item) => {
    const name = item.node.name?.toLowerCase() ?? "";
    const type = item.node.type.toLowerCase();
    const id = item.node.id.toLowerCase();

    return (
      name.includes(lowerQuery) ||
      type.includes(lowerQuery) ||
      id.includes(lowerQuery)
    );
  });
}
