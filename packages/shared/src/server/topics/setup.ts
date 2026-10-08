import type { z } from "zod";
import { InvalidRequestError } from "../../errors";
import { topicsSetupSchema, type TopicRule } from "../../topics";
import {
  prepareTopicsModelSettings,
  writeTopicsModelSettings,
} from "./model-config";
import {
  ensureDefaultTopicFacets,
  listTopicRules,
  saveTopicRule,
} from "./postgres";

/** One Topics setup: models, the four built-in facets, and a single rule. */
export async function saveTopicsSetup(
  projectId: string,
  input: z.input<typeof topicsSetupSchema>,
): Promise<TopicRule> {
  const setup = topicsSetupSchema.parse(input);
  const rules = await listTopicRules(projectId);
  if (rules.length > 1)
    throw new InvalidRequestError(
      "This project has more than one Topics rule.",
    );
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
  // Test the models first and enable them only after the rule is saved, so a
  // failed rule write never turns processing on with stale trace settings.
  const models = await prepareTopicsModelSettings(projectId, {
    summary: setup.summary,
    embedding: setup.embedding,
    embeddingDimensions: setup.embeddingDimensions,
    clustering: setup.clustering,
    enabled: setup.enabled,
  });
  const rule = await saveTopicRule({
    id: rules[0]?.id,
    projectId,
    name: rules[0]?.name ?? "Topics",
    filter: setup.filter,
    sampling: setup.sampling,
    idleTimeMs: setup.idleSeconds * 1000,
    facetIds,
  });
  await writeTopicsModelSettings(projectId, models);
  return rule;
}
