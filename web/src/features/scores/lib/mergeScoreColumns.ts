import { useScoreCache } from "@/src/features/scores/contexts/ScoreCacheContext";
import { type ScoreColumn } from "@/src/features/scores/types";

/**
 * Merges server score columns with cached score columns.
 * Deduplicates by key - if a column exists in both server and cache,
 * the server version is used (source of truth).
 *
 * @param serverColumns - Score columns from server
 * @returns Combined and deduplicated score columns, sorted alphabetically
 */
export function useMergeScoreColumns(
  serverColumns: ScoreColumn[],
): ScoreColumn[] {
  const { getColumnsMap } = useScoreCache();

  // Dedupe by key: combine server + cache columns, server wins conflicts
  const columnsMap = getColumnsMap();

  // Add all server columns (overwrites duplicates from cache)
  serverColumns.forEach((col) => columnsMap.set(col.key, col));

  // Return deduplicated, sorted list
  return Array.from(columnsMap.values()).sort((a, b) =>
    a.key.localeCompare(b.key),
  );
}
