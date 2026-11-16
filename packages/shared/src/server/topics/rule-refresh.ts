import { createHash } from "node:crypto";
import { prisma } from "../../db";
import { InvalidRequestError } from "../../errors/InvalidRequestError";
import { LangfuseConflictError } from "../../errors/ConflictError";
import { LangfuseNotFoundError } from "../../errors/NotFoundError";
import { TooManyRequestsError } from "../../errors/TooManyRequestsError";
import { TOPICS_MAX_SELECTION_RANGE_MS } from "../../topics";
import { redis } from "../redis/redis";
import { getEnabledTopicsModels } from "./model-config";
import {
  createTopicRun,
  getTopicRule,
  getTopicRuleMapRow,
  listTopicFacets,
} from "./postgres";
import { enqueueTopicRuleRefit } from "./queue";
import { isTopicRuleSetupActive, readTopicRuleSetup } from "./rule-setup";

export const TOPIC_RULE_REFRESH_COOLDOWN_MS = 15 * 60_000;

export type TopicRuleRefreshStatus = {
  /** When the next manual refresh may start; null when it may start now. */
  availableAt: string | null;
  /** Whether a fit of the rule's map is open, whichever started it. */
  running: boolean;
};

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
}): Promise<TopicRuleRefreshStatus> {
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
      "This map was refreshed less than 15 minutes ago.",
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
    availableAt: new Date(
      now.getTime() + TOPIC_RULE_REFRESH_COOLDOWN_MS,
    ).toISOString(),
    running: true,
  };
}
