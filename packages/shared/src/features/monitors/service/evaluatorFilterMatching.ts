import { Prisma, type PrismaClient } from "../../../db";

/**
 * Matches an evaluator ID against the positive evaluator filter operators
 * that can keep a monitor linked to that evaluator.
 */
export const evaluatorFilterMatchesSql = (
  filterRow: Prisma.Sql,
  evaluatorId: Prisma.Sql,
): Prisma.Sql => Prisma.sql`
  ${filterRow}->>'column' = 'evaluatorId'
  AND (
    (
      ${filterRow}->>'type' = 'string'
      AND (
        (${filterRow}->>'operator' = '=' AND ${evaluatorId} = ${filterRow}->>'value')
        OR (${filterRow}->>'operator' = 'contains' AND strpos(${evaluatorId}, ${filterRow}->>'value') > 0)
        OR (${filterRow}->>'operator' = 'starts with' AND starts_with(${evaluatorId}, ${filterRow}->>'value'))
      )
    )
    OR (
      ${filterRow}->>'type' = 'stringOptions'
      AND ${filterRow}->>'operator' = 'any of'
      AND ${filterRow}->'value' @> jsonb_build_array(${evaluatorId})
    )
  )
`;

/** Returns monitor IDs whose evaluator filter matches any supplied evaluator. */
export const findMonitorIdsLinkedToEvaluators = async (
  client: Pick<PrismaClient, "$queryRaw">,
  params: {
    projectId: string;
    evaluatorIds: string[];
    limit?: number;
  },
): Promise<string[]> => {
  if (params.evaluatorIds.length === 0) return [];

  const selectedEvaluators = Prisma.join(
    params.evaluatorIds.map((id) => Prisma.sql`(${id})`),
  );
  const matchesEvaluator = evaluatorFilterMatchesSql(
    Prisma.raw("filter_row"),
    Prisma.raw("selected_evaluator.id"),
  );
  const limit = params.limit ? Prisma.sql`LIMIT ${params.limit}` : Prisma.empty;

  const rows = await client.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT monitor.id
    FROM monitors AS monitor
    WHERE monitor.project_id = ${params.projectId}
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(monitor.filters) AS filter_row
        CROSS JOIN (VALUES ${selectedEvaluators}) AS selected_evaluator(id)
        WHERE ${matchesEvaluator}
      )
    ORDER BY monitor.updated_at DESC
    ${limit}
  `);

  return rows.map(({ id }) => id);
};
