import { prisma, Prisma } from "../../db";
import { TopicsTargetObject } from "../../features/evals/types";

// Same facet-only assignment predicate as topicRuleWhere. The rule PK and
// (evaluation_rule_id, evaluator_id) index bound this check to a single map.
export function topicRuleCostScope(projectId: string) {
  return Prisma.sql`e.project_id = ${projectId} AND e.target_object = ${TopicsTargetObject}
    AND (SELECT bool_and(a.project_id = e.project_id AND f.project_id = e.project_id AND f.type = 'FACET')
         FROM evaluation_rule_evaluator_assignments a JOIN evaluators f ON f.id = a.evaluator_id
         WHERE a.evaluation_rule_id = e.id)`;
}

/** Redis drains batches in project order. Each map commits a batch and its sequence together. */
export async function applyTopicRuleProcessingCostBatch({
  projectId,
  sequence,
  shares,
}: {
  projectId: string;
  sequence: number;
  shares: { ruleId: string; cost: number | null; partial: boolean }[];
}): Promise<void> {
  if (!shares.length) return;
  if (!Number.isSafeInteger(sequence) || sequence < 1)
    throw new Error("Invalid Topics processing cost batch sequence.");

  await prisma.$executeRaw`
    WITH shares AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(shares)}::jsonb)
        AS s("ruleId" text, cost numeric, partial boolean)
    ), locked AS MATERIALIZED (
      SELECT e.id FROM evaluation_rules e JOIN shares s ON s."ruleId" = e.id
      WHERE ${topicRuleCostScope(projectId)}
      ORDER BY e.id FOR UPDATE OF e
    )
    UPDATE evaluation_rules e SET topics_processing_cost = jsonb_build_object(
      'sequence', ${sequence}::bigint,
      'updatedAt', statement_timestamp(),
      'cost', CASE WHEN s.cost IS NULL THEN (e.topics_processing_cost->>'cost')::numeric
                   ELSE COALESCE((e.topics_processing_cost->>'cost')::numeric, 0) + s.cost END,
      'partial', e.topics_processing_cost IS NULL OR COALESCE((e.topics_processing_cost->>'partial')::boolean, false)
                 OR s.partial OR s.cost IS NULL)
    FROM shares s JOIN locked l ON l.id = s."ruleId"
    WHERE e.project_id = ${projectId} AND e.id = l.id
      AND COALESCE((e.topics_processing_cost->>'sequence')::bigint, 0) < ${sequence}::bigint
  `;
}
