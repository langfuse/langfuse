import { Prisma, prisma } from "../../db";
import { traceException } from "../instrumentation";
import { logger } from "../logger";
import {
  getTopicRuleProcessingCosts,
  getTopicRunNamingCosts,
} from "./clickhouse";
import { topicRuleWhere } from "./processing-gate";

/** Attribute each version's naming cost to the map or snapshot that owned its creating run. */
async function getNamingCostsByOwner(
  projectId: string,
  owner: "ruleId" | "batchActionId",
  ids: string[],
): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  try {
    const runs = await prisma.topicClusteringRun.findMany({
      where: { projectId, [owner]: { in: ids } },
      select: { id: true, ruleId: true, batchActionId: true },
    });
    const costs = await getTopicRunNamingCosts(
      projectId,
      runs.map((run) => run.id),
    );
    const totals = new Map<string, Prisma.Decimal>();
    for (const run of runs) {
      const ownerId = run[owner];
      const cost = costs[run.id];
      if (ownerId != null && cost != null) {
        totals.set(
          ownerId,
          new Prisma.Decimal(cost).plus(totals.get(ownerId) ?? 0),
        );
      }
    }
    return Object.fromEntries(
      Array.from(totals, ([id, total]) => [id, total.toNumber()]),
    );
  } catch (error) {
    traceException(error);
    logger.warn("Failed to read Topics naming costs", {
      projectId,
      owner,
      error,
    });
    return {};
  }
}

export function getTopicExecutionNamingCosts(
  projectId: string,
  executionIds: string[],
) {
  return getNamingCostsByOwner(projectId, "batchActionId", executionIds);
}

export async function getTopicRuleMapCosts(
  projectId: string,
): Promise<Record<string, number | null>> {
  const rules = await prisma.evaluationRule.findMany({
    where: topicRuleWhere(projectId),
    select: { id: true },
  });
  const ids = rules.map((rule) => rule.id);
  const [processing, naming] = await Promise.all([
    getTopicRuleProcessingCosts(projectId, ids),
    getNamingCostsByOwner(projectId, "ruleId", ids),
  ]);
  return Object.fromEntries(
    ids.map((id) => {
      const summary = processing[id];
      const names = naming[id];
      return [
        id,
        summary == null && names == null
          ? null
          : new Prisma.Decimal(summary ?? 0).plus(names ?? 0).toNumber(),
      ];
    }),
  );
}
