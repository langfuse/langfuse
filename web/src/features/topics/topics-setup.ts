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
  const idleSeconds = topicsSetupSchema.shape.idleSeconds.safeParse(
    Number(value.idleSeconds),
  );
  if (!idleSeconds.success) {
    const message = idleSeconds.error.issues[0]?.message ?? "";
    throw new Error(
      message.includes("expected int")
        ? "Enter a whole number of seconds."
        : message || "Check the idle time.",
    );
  }
  const parsed = topicsSetupSchema.safeParse({
    ...slots,
    enabled: true,
    facets: value.facets
      .filter((facet) => facet.builtIn)
      .map((facet) => ({ name: facet.name, enabled: facet.enabled })),
    filter: value.filters,
    sampling: value.sampling,
    idleSeconds: idleSeconds.data,
  });
  if (!parsed.success)
    throw new Error(
      parsed.error.issues[0]?.message ?? "Could not save Topics.",
    );
  return parsed.data;
}
