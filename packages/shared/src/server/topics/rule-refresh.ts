import { createHash } from "node:crypto";
import { prisma } from "../../db";
import { InvalidRequestError } from "../../errors/InvalidRequestError";
import { LangfuseConflictError } from "../../errors/ConflictError";
import { LangfuseNotFoundError } from "../../errors/NotFoundError";
import { TooManyRequestsError } from "../../errors/TooManyRequestsError";
import {
  TOPIC_RULE_REFRESH_COOLDOWN_MS,
  TOPICS_MAX_SELECTION_RANGE_MS,
} from "../../topics";
import { redis } from "../redis/redis";
import { getEnabledTopicsModels } from "./model-config";
import {
  createTopicRun,
  getTopicRule,
  getTopicRuleMapRow,
  getTopicRunNamingCosts,
  listTopicFacets,
} from "./postgres";
import { enqueueTopicRuleRefit } from "./queue";
import { isTopicRuleSetupActive, readTopicRuleSetup } from "./rule-setup";

export type TopicRuleRefreshStatus = {
  /** When the next manual refresh may start; null when it may start now. */
  availableAt: string | null;
  /** Whether a fit of the rule's map is open, whichever started it. */
  running: boolean;
};

/** Shared by the fits of every question in a single map operation, including scheduler retries. */
export function topicRuleOperation(
  ruleId: string,
  trigger: "manual" | "nightly" | "setup",
  occurrence: string,
) {
  const id = createHash("sha256")
    .update(JSON.stringify([ruleId, trigger, occurrence]))
    .digest("hex")
    .slice(0, 48);
  return { id, trigger };
}

type RefreshGroup = {
  id: string;
  trigger: "manual" | "nightly";
  startedAt: Date;
  status:
    | "running"
    | "completed"
    | "completed_with_errors"
    | "skipped"
    | "failed";
  runIds: string[];
};

/** The selected map's ten most recent tracked refreshes, with every facet in each total. */
export async function listTopicRuleRefreshes(
  projectId: string,
  ruleId: string,
) {
  const groups = await prisma.$queryRaw<RefreshGroup[]>`
    SELECT config->'ruleOperation'->>'id' AS id,
           config->'ruleOperation'->>'trigger' AS trigger,
           min(created_at) AS "startedAt",
           CASE WHEN bool_or(status IN ('pending', 'running')) THEN 'running'
                WHEN bool_and(status = 'failed') THEN 'failed'
                WHEN bool_or(status = 'failed') THEN 'completed_with_errors'
                WHEN bool_and(status = 'skipped') THEN 'skipped'
                ELSE 'completed' END AS status,
           array_agg(topic_clustering_runs.id) AS "runIds"
    FROM topic_clustering_runs
    WHERE project_id = ${projectId} AND rule_id = ${ruleId}
      AND config->'ruleOperation'->>'trigger' IN ('manual', 'nightly')
    GROUP BY 1, 2
    ORDER BY 3 DESC, 1 DESC
    LIMIT 10
  `;
  const costs = await getTopicRunNamingCosts(
    projectId,
    groups.flatMap((group) => group.runIds),
  );
  return groups.map(({ runIds, ...group }) => {
    let cost: number | null = null;
    let missing = false;
    for (const id of runIds) {
      const run = costs[id];
      if (run?.cost != null) cost = (cost ?? 0) + run.cost;
      if (run?.cost == null || run.partial) missing = true;
    }
    return {
      ...group,
      startedAt: group.startedAt.toISOString(),
      cost,
      partial: cost !== null && missing,
    };
  });
}

// Holds no data: it exists for the cooldown after a manual refresh started, then expires.
const cooldownKey = (projectId: string, ruleId: string) =>
  `topics:rule-refresh:{${projectId}}:${ruleId}`;

/** The refresh status of each rule, in order; setup's fits are not refreshes. */
export async function getTopicRuleRefreshStatuses(
  projectId: string,
  ruleIds: string[],
): Promise<TopicRuleRefreshStatus[]> {
  if (!ruleIds.length) return [];
  const [open, cooldowns, setups] = await Promise.all([
    prisma.topicClusteringRun.findMany({
      where: {
        projectId,
        ruleId: { in: ruleIds },
        status: { in: ["pending", "running"] },
      },
      distinct: ["ruleId"],
      select: { ruleId: true },
    }),
    Promise.all(
      ruleIds.map(
        async (ruleId) =>
          (await redis?.pttl(cooldownKey(projectId, ruleId))) ?? -2,
      ),
    ),
    Promise.all(
      ruleIds.map(async (ruleId) =>
        isTopicRuleSetupActive(await readTopicRuleSetup(projectId, ruleId)),
      ),
    ),
  ]);
  const openRules = new Set(open.map((run) => run.ruleId));
  const now = Date.now();
  return ruleIds.map((ruleId, index) => ({
    availableAt:
      cooldowns[index] > 0
        ? new Date(now + cooldowns[index]).toISOString()
        : null,
    running: openRules.has(ruleId) && !setups[index],
  }));
}

/**
 * Refits the rule's map of each of its facets now, through the same refit job
 * and window as the nightly scheduler, even without new summaries. At most
 * one refresh per rule starts within the cooldown, and none while another fit
 * of the rule or its setup is open.
 */
export async function startTopicRuleRefresh({
  projectId,
  ruleId,
  now = new Date(),
}: {
  projectId: string;
  ruleId: string;
  now?: Date;
}): Promise<TopicRuleRefreshStatus & { operationId: string }> {
  if (!redis) throw new Error("Refreshing a map requires Redis.");
  const rule = await getTopicRule(projectId, ruleId);
  if (!rule) throw new LangfuseNotFoundError("Topic rule not found.");
  if (rule.enabled === false)
    throw new InvalidRequestError("Turn on live updates to refresh this map.");
  const models = (await getEnabledTopicsModels([projectId])).get(projectId);
  if (!models)
    throw new InvalidRequestError(
      "Turn on automatic processing to refresh this map.",
    );
  if (isTopicRuleSetupActive(await readTopicRuleSetup(projectId, ruleId)))
    throw new LangfuseConflictError(
      "This map's first topics are still being built.",
    );
  const openRuns = await prisma.topicClusteringRun.count({
    where: { projectId, ruleId, status: { in: ["pending", "running"] } },
  });
  if (openRuns > 0)
    throw new LangfuseConflictError("This map is already being refreshed.");

  const embedding = {
    embeddingModel: models.embedding.model,
    dimensions: models.embedding.dimensions,
  };
  const startedAt = now.toISOString();
  const ruleOperation = topicRuleOperation(ruleId, "manual", startedAt);
  const facets = (await listTopicFacets(projectId)).flatMap((facet) => {
    const version = facet.versions[0]?.version;
    return version && rule.facetIds.includes(facet.id)
      ? [{ facetId: facet.id, facetVersion: version }]
      : [];
  });
  if (!facets.length)
    throw new InvalidRequestError("This map has no questions to refresh.");
  const runs = facets.map((facet) => ({
    ...facet,
    id: createHash("sha256")
      .update(
        JSON.stringify(["rule-refresh", ruleId, facet, embedding, startedAt]),
      )
      .digest("hex")
      .slice(0, 48),
  }));
  // NX lets one of two concurrent starts through; the key expires with the cooldown.
  const claimed = await redis.set(
    cooldownKey(projectId, ruleId),
    "",
    "PX",
    TOPIC_RULE_REFRESH_COOLDOWN_MS,
    "NX",
  );
  if (claimed !== "OK")
    throw new TooManyRequestsError(
      `This map was refreshed less than ${TOPIC_RULE_REFRESH_COOLDOWN_MS / 60_000} minutes ago.`,
    );
  try {
    for (const run of runs) {
      const current = await getTopicRuleMapRow(projectId, ruleId, run.facetId);
      await createTopicRun({
        ...run,
        projectId,
        ruleId,
        config: {
          ...embedding,
          ruleOperation,
          timeRange: {
            from: new Date(
              now.getTime() - TOPICS_MAX_SELECTION_RANGE_MS,
            ).toISOString(),
            to: startedAt,
          },
          // Lets the fit fall back to small-sample mode instead of skipping.
          refresh: true,
          // A provisional map still awaits seeded summaries; the next nightly refit must include them.
          ...((current?.config as Record<string, unknown> | undefined)
            ?.provisional === true && { provisional: true }),
        },
      });
      await enqueueTopicRuleRefit(projectId, run.id);
    }
  } catch (error) {
    // A run without a queued job would block the next refresh until the nightly refit.
    await prisma.topicClusteringRun.updateMany({
      where: {
        projectId,
        id: { in: runs.map((run) => run.id) },
        status: "pending",
      },
      data: {
        status: "failed",
        error: "Could not start the refresh.",
        finishedAt: new Date(),
      },
    });
    await redis.del(cooldownKey(projectId, ruleId));
    throw error;
  }
  return {
    operationId: ruleOperation.id,
    availableAt: new Date(
      now.getTime() + TOPIC_RULE_REFRESH_COOLDOWN_MS,
    ).toISOString(),
    running: true,
  };
}
