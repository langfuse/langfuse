import { Prisma } from "@prisma/client";
import { TracingSearchType } from "../../../interfaces/search";

/**
 * Builds PostgreSQL search condition for full-text search using ILIKE.
 * Returns Prisma.sql for use in raw queries, or Prisma.empty if no search query provided.
 *
 * Missing column definitions make it obvious which search types are NOT supported:
 * - If `contentColumns.content` is missing/empty → "content" search is not supported
 * - If `contentColumns.input` is undefined → "input" search is not supported
 * - If `contentColumns.output` is undefined → "output" search is not supported
 *
 * @param searchQuery - The search string to match against
 * @param searchType - Array of search types: "id", "content", "input", "output"
 * @param tablePrefix - Optional table alias/prefix (e.g., "p" for prompts, "di" for dataset items)
 * @param metadataColumns - Array of column names to search when searchType includes "id" (e.g., ["name"])
 * @param contentColumns - Column mappings that define which search types are supported
 * @param additionalConditions - Optional additional Prisma.Sql conditions to OR with the main search
 *
 */
export function postgresSearchCondition(params: {
  searchQuery?: string | null;
  searchType?: TracingSearchType[];
  tablePrefix?: string;
  metadataColumns: string[];
  contentColumns: {
    content?: string[]; // Optional - if missing, content search not supported
    input?: string; // Optional - if missing, input search not supported
    output?: string; // Optional - if missing, output search not supported
  };
  additionalConditions?: Prisma.Sql[];
}): Prisma.Sql {
  const {
    searchQuery,
    searchType,
    tablePrefix = "",
    metadataColumns = [],
    contentColumns,
    additionalConditions = [],
  } = params;

  if (searchQuery === undefined || searchQuery === null || searchQuery === "") {
    return Prisma.empty;
  }

  const prefix = tablePrefix ? `${tablePrefix}.` : "";
  const types = searchType ?? ["id"];
  const searchConditions: Prisma.Sql[] = [];

  // Search metadata columns (id, name, etc.)
  if (types.includes("id")) {
    for (const column of metadataColumns) {
      searchConditions.push(
        Prisma.sql`${Prisma.raw(`${prefix}${column}`)} ILIKE ${`%${searchQuery}%`}`,
      );
    }
  }

  // Search content - both input and output (only if columns are defined)
  if (
    types.includes("content") &&
    contentColumns.content &&
    contentColumns.content.length > 0
  ) {
    for (const column of contentColumns.content) {
      searchConditions.push(
        Prisma.sql`${Prisma.raw(`${prefix}${column}`)}::text ILIKE ${`%${searchQuery}%`}`,
      );
    }
  }

  // Search input only (only if column is defined)
  if (types.includes("input") && contentColumns.input) {
    searchConditions.push(
      Prisma.sql`${Prisma.raw(`${prefix}${contentColumns.input}`)}::text ILIKE ${`%${searchQuery}%`}`,
    );
  }

  // Search output only (only if column is defined)
  if (types.includes("output") && contentColumns.output) {
    searchConditions.push(
      Prisma.sql`${Prisma.raw(`${prefix}${contentColumns.output}`)}::text ILIKE ${`%${searchQuery}%`}`,
    );
  }

  // Add any additional custom conditions
  searchConditions.push(...additionalConditions);

  return searchConditions.length > 0
    ? Prisma.sql` AND (${Prisma.join(searchConditions, " OR ")})`
    : Prisma.empty;
}
