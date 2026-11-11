import { topicsSetupSchema, type TopicsSetup } from "@langfuse/shared/topics";
import type { ConfigureTopicsSaveDraft } from "./ConfigureTopicsDialog";

type Slots = Pick<
  TopicsSetup,
  "summary" | "embedding" | "embeddingDimensions" | "clustering"
>;

/** The Topics Settings save: models and idle time; it never changes a rule. */
export function topicsSetupPayload(
  value: ConfigureTopicsSaveDraft,
  slots: Slots,
): TopicsSetup {
  const parsed = topicsSetupSchema.safeParse({
    ...slots,
    traceIdleMs: Number(value.idleSeconds) * 1000,
  });
  if (!parsed.success)
    throw new Error(
      parsed.error.issues[0]?.message ?? "Could not save Topics.",
    );
  return parsed.data;
}
