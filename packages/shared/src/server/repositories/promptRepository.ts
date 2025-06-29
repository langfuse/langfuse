import { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { FilterState } from "../../types";
import { tableColumnsToSqlFilterAndPrefix } from "../filterToPrisma";
import { promptsTableCols } from "../../tableDefinitions";

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
