import type { z } from "zod";
import { InvalidRequestError } from "../../errors";
import {
  topicsAutomaticProcessingSchema,
  topicsSetupSchema,
  type TopicRule,
} from "../../topics";
import {
  checkStoredTopicsModels,
  prepareTopicsModelSettings,
  writeTopicsModelSettings,
} from "./model-config";
import { prisma } from "../../db";
import {
  cacheTracingReadinessSettings,
  writeTracingReadinessSettings,
} from "../tracingReadinessSettings";
import {
  ensureDefaultTopicFacets,
  getTopicRule,
  listTopicRules,
  writeTopicRule,
  type TopicRuleInput,
} from "./postgres";
import {
  invalidateTopicsProcessingActive,
  topicRuleWhere,
} from "./processing-gate";

/**
 * One Topics setup: models, the four built-in facets, and a single rule. It
 * keeps the stored automatic-processing state, pause and sampling rate.
 */
export async function saveTopicsSetup(
  projectId: string,
  input: z.input<typeof topicsSetupSchema>,
  userId: string | null = null,
): Promise<TopicRule> {
  const setup = topicsSetupSchema.parse(input);
  const facets = await ensureDefaultTopicFacets(projectId);
  const facetIdByName = new Map(
    facets
      .filter((facet) => facet.isBuiltIn)
      .map((facet) => [facet.name, facet.id]),
  );
  const facetIds = setup.facets.flatMap((facet) => {
    if (!facet.enabled) return [];
    const id = facetIdByName.get(facet.name);
    if (!id)
      throw new InvalidRequestError(
        `Built-in facet ${facet.name} was not created.`,
      );
    return [id];
  });
  facetIds.push(...setup.customFacetIds);
  // The test calls hit the network, so they run before the transaction.
  const models = await prepareTopicsModelSettings(projectId, {
    summary: setup.summary,
    embedding: setup.embedding,
    embeddingDimensions: setup.embeddingDimensions,
    clustering: setup.clustering,
  });
  return saveTopicRuleAndModels(
    {
      id: setup.ruleId,
      projectId,
      userId,
      filter: setup.filter,
      facetIds,
    },
    models,
    setup.traceIdleMs,
  );
}

/**
 * Writes the rule and the model settings together: a failed model write must
 * not leave a rule without models, and a failed rule write must not enable them.
 */
export async function saveTopicRuleAndModels(
  rule: TopicRuleInput,
  models: Parameters<typeof writeTopicsModelSettings>[1],
  traceIdleMs: number,
): Promise<TopicRule> {
  const saved = await prisma.$transaction(async (tx) => {
    const saved = await writeTopicRule(tx, rule);
    await writeTopicsModelSettings(rule.projectId, models, {
      userId: rule.userId,
      tx,
    });
    await writeTracingReadinessSettings(
      tx,
      rule.projectId,
      { traceIdleMs },
      rule.userId,
    );
    return saved;
  });
  await cacheTracingReadinessSettings(rule.projectId, { traceIdleMs });
  await invalidateTopicsProcessingActive(rule.projectId);
  return saved;
}

/**
 * Turns automatic processing of new traces on or off. Turning it on requires all
 * three stored models and re-tests them after a pause; either direction clears
 * a pause.
 * Sampling, when given, is written to the project's Topics rule.
 */
export async function setTopicsAutomaticProcessing(
  projectId: string,
  input: z.input<typeof topicsAutomaticProcessingSchema>,
  userId: string | null = null,
): Promise<{ ruleBefore: TopicRule; ruleAfter: TopicRule }> {
  const { enabled, sampling } = topicsAutomaticProcessingSchema.parse(input);
  const [config, rules] = await Promise.all([
    prisma.topicConfig.findUnique({ where: { projectId } }),
    listTopicRules(projectId),
  ]);
  const rule = rules[0];
  if (!config || !rule)
    throw new InvalidRequestError(
      "Save the Topics setup in Configure Topics first.",
    );
  if (rules.length > 1)
    throw new InvalidRequestError(
      "This project has more than one Topics rule.",
    );
  if (enabled) await checkStoredTopicsModels(config);

  await prisma.$transaction(async (tx) => {
    await tx.topicConfig.update({
      where: { projectId },
      data: {
        enabled,
        blockedAt: null,
        blockReason: null,
        blockMessage: null,
        updatedBy: userId,
      },
    });
    if (sampling !== undefined && sampling !== rule.sampling)
      await tx.evaluationRule.update({
        where: { ...topicRuleWhere(projectId), id: rule.id },
        data: { sampling },
      });
  });
  await invalidateTopicsProcessingActive(projectId);
  const ruleAfter = (await getTopicRule(projectId, rule.id)) ?? rule;
  return { ruleBefore: rule, ruleAfter };
}
