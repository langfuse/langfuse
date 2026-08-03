/**
 * Escapes SQL LIKE/ILIKE wildcard characters for literal matching.
 */
export const escapeSqlLikePattern = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
