import { Prisma } from "@prisma/client";

/**
 * SQL utilities for building common query patterns.
 *
 * These helpers provide consistent, safe ways to build SQL fragments
 * for case-insensitive search operations.
 */

const wrap = (query: string) => `%${query.trim()}%`;

/**
 * Build an ILIKE condition for a single column.
 *
 * @param column - Column name (can include table alias, e.g., "d.name")
 * @param query - Search query string
 * @returns Prisma.Sql fragment: "column ILIKE '%query%'"
 *
 * @example
 * ```ts
 * ilike('d.name', 'foo')
 * // SQL: d.name ILIKE '%foo%'
 * ```
 */
export const ilike = (column: string, query: string) =>
  Prisma.sql`${Prisma.raw(column)} ILIKE ${wrap(query)}`;

/**
 * Build an AND ILIKE condition, or Prisma.empty if query is null/empty.
 *
 * @param column - Column name (can include table alias)
 * @param query - Optional search query string
 * @returns Prisma.Sql fragment: "AND column ILIKE '%query%'" or Prisma.empty
 *
 * @example
 * ```ts
 * Prisma.sql`SELECT * FROM datasets WHERE project_id = ${projectId} ${ilikeAnd('name', searchQuery)}`
 * // If searchQuery = 'foo': SELECT * FROM datasets WHERE project_id = 'abc' AND name ILIKE '%foo%'
 * // If searchQuery = null:  SELECT * FROM datasets WHERE project_id = 'abc'
 * ```
 */
export const ilikeAnd = (column: string, query?: string | null) =>
  query?.trim()
    ? Prisma.sql`AND ${Prisma.raw(column)} ILIKE ${wrap(query)}`
    : Prisma.empty;

/**
 * Build an OR'd ILIKE condition across multiple columns, or Prisma.empty if query is null/empty.
 *
 * @param columns - Array of column names
 * @param query - Optional search query string
 * @returns Prisma.Sql fragment: "(col1 ILIKE '%query%' OR col2 ILIKE '%query%')" or Prisma.empty
 *
 * @example
 * ```ts
 * ilikeOr(['u.name', 'u.email'], 'john')
 * // SQL: (u.name ILIKE '%john%' OR u.email ILIKE '%john%')
 * ```
 */
export const ilikeOr = (columns: string[], query?: string | null) =>
  query?.trim() && columns.length
    ? Prisma.sql`(${Prisma.join(
        columns.map((col) => ilike(col, query)),
        " OR ",
      )})`
    : Prisma.empty;
