import type { z } from "zod";
import { InvalidRequestError } from "../../errors/InvalidRequestError";
import { invalidateProjectEvalConfigCaches } from "../evalJobConfigCache";
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
import { prisma, type Prisma } from "../../db";
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
 * One Topics setup: models, the four built-in facets, and optionally a rule.
 * Rule fields are written to the rule named by `ruleId`, or to a new rule
 * without one; a save without rule fields never changes a rule. It keeps the
 * stored automatic-processing state, pause and sampling rate. Returns the
 * written rule, or null for a settings-only save.
 */
export async function saveTopicsSetup(
  projectId: string,
  input: z.input<typeof topicsSetupSchema>,
  userId: string | null = null,
): Promise<TopicRule | null> {
  const setup = topicsSetupSchema.parse(input);
  const rules = await listTopicRules(projectId);
  const existing = setup.ruleId
    ? rules.find((rule) => rule.id === setup.ruleId)
    : undefined;
  if (setup.ruleId && !existing)
    throw new InvalidRequestError("Topic rule not found in this project.");
  const sendsRuleFields =
    setup.facets !== undefined ||
    setup.customFacetIds !== undefined ||
    setup.filter !== undefined;
  // Settings saves models and idle time only, so only setup creates a rule.
  const writesRule = Boolean(existing) || sendsRuleFields;
  if (writesRule && !setup.facets)
    throw new InvalidRequestError("Choose the facets for the Topics rule.");
  const filter = setup.filter ?? existing?.filter ?? [];

  const facets = await ensureDefaultTopicFacets(projectId);
  const facetIdByName = new Map(
    facets
      .filter((facet) => facet.isBuiltIn)
      .map((facet) => [facet.name, facet.id]),
  );
  const facetIds = (setup.facets ?? []).flatMap((facet) => {
    if (!facet.enabled) return [];
    const id = facetIdByName.get(facet.name);
    if (!id)
      throw new InvalidRequestError(
        `Built-in facet ${facet.name} was not created.`,
      );
    return [id];
  });
  facetIds.push(...(setup.customFacetIds ?? []));
  // The test calls hit the network, so they run before the transaction.
  const models = await prepareTopicsModelSettings(projectId, {
    summary: setup.summary,
    embedding: setup.embedding,
    embeddingDimensions: setup.embeddingDimensions,
    clustering: setup.clustering,
  });
  if (!writesRule) {
    await writeModelsAndReadiness(
      projectId,
      userId,
      models,
      setup.traceIdleMs,
      () => Promise.resolve(null),
    );
    return null;
  }
  return saveTopicRuleAndModels(
    {
      id: existing?.id,
      // A concurrent first setup updates the rule it created instead of adding one.
      firstRule: rules.length === 0,
      name: existing ? undefined : setup.name,
      projectId,
      userId,
      filter,
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
  return writeModelsAndReadiness(
    rule.projectId,
    rule.userId ?? null,
    models,
    traceIdleMs,
    (tx) => writeTopicRule(tx, rule),
  );
}

async function writeModelsAndReadiness<T>(
  projectId: string,
  userId: string | null,
  models: Parameters<typeof writeTopicsModelSettings>[1],
  traceIdleMs: number,
  writeRule: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const saved = await prisma.$transaction(async (tx) => {
    const saved = await writeRule(tx);
    await writeTopicsModelSettings(projectId, models, { userId, tx });
    await writeTracingReadinessSettings(tx, projectId, { traceIdleMs }, userId);
    return saved;
  });
  await cacheTracingReadinessSettings(projectId, { traceIdleMs });
  await invalidateProjectEvalConfigCaches(projectId);
  return saved;
}

/**
 * Turns automatic processing of new traces on or off. Turning it on requires all
 * three stored models and re-tests them after a pause; either direction clears
 * a pause.
 * Sampling is written only to the rule named by `ruleId`.
 */
export async function setTopicsAutomaticProcessing(
  projectId: string,
  input: z.input<typeof topicsAutomaticProcessingSchema>,
  userId: string | null = null,
): Promise<{ ruleBefore: TopicRule | null; ruleAfter: TopicRule | null }> {
  const { enabled, ruleId, sampling } =
    topicsAutomaticProcessingSchema.parse(input);
  if (sampling !== undefined && !ruleId)
    throw new InvalidRequestError(
      "Choose the Topics rule whose sample rate changes.",
    );
  const [config, rules] = await Promise.all([
    prisma.topicConfig.findUnique({ where: { projectId } }),
    listTopicRules(projectId),
  ]);
  if (!config || !rules.length)
    throw new InvalidRequestError(
      "Save the Topics setup in Configure Topics first.",
    );
  const rule = ruleId ? rules.find((item) => item.id === ruleId) : undefined;
  if (ruleId && !rule)
    throw new InvalidRequestError("Topic rule not found in this project.");
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
    if (rule && sampling !== undefined && sampling !== rule.sampling)
      await tx.evaluationRule.update({
        where: { ...topicRuleWhere(projectId), id: rule.id },
        data: { sampling },
      });
  });
  await invalidateTopicsProcessingActive(projectId);
  if (!rule) return { ruleBefore: null, ruleAfter: null };
  const ruleAfter = (await getTopicRule(projectId, rule.id)) ?? rule;
  return { ruleBefore: rule, ruleAfter };
}
