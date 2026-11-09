import { topicsSetupSchema, type TopicsSetup } from "@langfuse/shared/topics";
import type { ConfigureTopicsSaveDraft } from "./ConfigureTopicsDialog";

type Slots = Pick<
  TopicsSetup,
  "summary" | "embedding" | "embeddingDimensions" | "clustering"
>;

export function topicsSetupPayload(
  value: ConfigureTopicsSaveDraft,
  slots: Slots,
): TopicsSetup {
  const parsed = topicsSetupSchema.safeParse({
    ...slots,
    facets: value.facets
      .filter((facet) => facet.builtIn)
      .map((facet) => ({ name: facet.name, enabled: facet.enabled })),
    customFacetIds: value.facets
      .filter((facet) => !facet.builtIn && facet.enabled)
      .map((facet) => facet.id),
    filter: value.filters,
    traceIdleMs: Number(value.idleSeconds) * 1000,
  });
  if (!parsed.success)
    throw new Error(
      parsed.error.issues[0]?.message ?? "Could not save Topics.",
    );
  return parsed.data;
}
