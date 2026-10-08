import { InvalidRequestError } from "../../errors";
import {
  topicsSetupSchema,
  type TopicRule,
  type TopicsSetup,
} from "../../topics";
import { saveTopicsModelSettings } from "./model-config";
import {
  ensureDefaultTopicFacets,
  listTopicRules,
  saveTopicRule,
} from "./postgres";

/** One Topics setup: models, the four built-in facets, and a single rule. */
export async function saveTopicsSetup(
  projectId: string,
  input: TopicsSetup,
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
  await saveTopicsModelSettings(projectId, {
    summary: setup.summary,
    embedding: setup.embedding,
    embeddingDimensions: setup.embeddingDimensions,
    clustering: setup.clustering,
    enabled: setup.enabled,
  });
  return saveTopicRule({
    id: rules[0]?.id,
    projectId,
    name: rules[0]?.name ?? "Topics",
    filter: setup.filter,
    sampling: setup.sampling,
    idleTimeMs: setup.idleSeconds * 1000,
    facetIds,
  });
}
