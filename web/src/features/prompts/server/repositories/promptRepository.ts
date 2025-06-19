import { promptsTableCols } from "@/src/server/api/definitions/promptsTable";
import { type FilterState } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { tableColumnsToSqlFilterAndPrefix } from "@langfuse/shared/src/server";
import { Prisma } from "@prisma/client";

/**
 * Check if any prompt exists for the given projectId and filter conditions
 * (useful for general filter validation)
 */
export async function anyPromptExists(params: {
  projectId: string;
  promptId: string;
  filter?: FilterState;
}): Promise<boolean> {
  const { projectId, promptId, filter } = params;

  // Generate filter condition from the filter state
  const filterCondition = tableColumnsToSqlFilterAndPrefix(
    filter ?? [],
    promptsTableCols,
    "prompts" as const,
  );

  // Build the query to check if any prompt exists with the given filters
  const query = Prisma.sql`
        SELECT 1 as "exists"
        FROM prompts p
        WHERE p."project_id" = ${projectId}
          AND p."id" = ${promptId}
          ${filterCondition}
        LIMIT 1
      `;

  const result = await prisma.$queryRaw<Array<{ exists: number }>>(query);

  return result.length > 0;
}
