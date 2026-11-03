import { topicsSetupSchema, type TopicsSetup } from "@langfuse/shared/topics";
import type { ConfigureTopicsSaveDraft } from "./ConfigureTopicsDialog";

type Slots = Pick<
  TopicsSetup,
  "summary" | "embedding" | "embeddingDimensions" | "clustering"
>;

/**
 * The Configure Topics save. Facets go to `ruleId`, or to the first rule while
 * the project has none; without facets the save changes no rule. It never
 * sends a filter, so a rule keeps the filter edited on the rules page.
 */
export function topicsSetupPayload(
  value: ConfigureTopicsSaveDraft,
  slots: Slots,
  ruleId: string | undefined,
): TopicsSetup {
  const parsed = topicsSetupSchema.safeParse({
    ...slots,
    ...(value.facets
      ? {
          facets: value.facets
            .filter((facet) => facet.builtIn)
            .map((facet) => ({ name: facet.name, enabled: facet.enabled })),
          customFacetIds: value.facets
            .filter((facet) => !facet.builtIn && facet.enabled)
            .map((facet) => facet.id),
          ruleId,
        }
      : {}),
    traceIdleMs: Number(value.idleSeconds) * 1000,
  });
  if (!parsed.success)
    throw new Error(
      parsed.error.issues[0]?.message ?? "Could not save Topics.",
    );
  return parsed.data;
}
