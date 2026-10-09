import type { z } from "zod";
import { InvalidRequestError } from "../../errors";
import { topicsSetupSchema, type TopicRule } from "../../topics";
import {
  prepareTopicsModelSettings,
  writeTopicsModelSettings,
} from "./model-config";
import { prisma } from "../../db";
import {
  ensureDefaultTopicFacets,
  writeTopicRule,
  type TopicRuleInput,
} from "./postgres";

/** One Topics setup: models, the four built-in facets, and a single rule. */
export async function saveTopicsSetup(
  projectId: string,
  input: z.input<typeof topicsSetupSchema>,
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
    enabled: setup.enabled,
  });
  return saveTopicRuleAndModels(
    {
      projectId,
      filter: setup.filter,
      sampling: setup.sampling,
      idleTimeMs: setup.idleSeconds * 1000,
      facetIds,
    },
    models,
  );
}

/**
 * Writes the rule and the model settings together: a failed model write must
 * not leave a rule without models, and a failed rule write must not enable them.
 */
export async function saveTopicRuleAndModels(
  rule: TopicRuleInput,
  models: Parameters<typeof writeTopicsModelSettings>[1],
): Promise<TopicRule> {
  return prisma.$transaction(async (tx) => {
    const saved = await writeTopicRule(tx, rule);
    await writeTopicsModelSettings(rule.projectId, models, tx);
    return saved;
  });
}
