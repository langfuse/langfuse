import { topicsSetupSchema, type TopicsSetup } from "@langfuse/shared/topics";
import type { ConfigureTopicsSaveDraft } from "./ConfigureTopicsDialog";

export const OPENROUTER_BROADCAST_TOPICS_NOTICE =
  "If you use OpenRouter Broadcast to send traces to Langfuse, exclude this API key in OpenRouter Broadcast settings so Topics model calls don't create extra traces toward your usage quota.";

export function isOpenRouterBaseURL(
  baseURL: string | null | undefined,
): boolean {
  if (!baseURL) return false;
  try {
    const url = new URL(baseURL.replace("{model}", "model"));
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    return hostname === "openrouter.ai" || hostname.endsWith(".openrouter.ai");
  } catch {
    return false;
  }
}

export function getOpenRouterProviders(
  connections: ReadonlyArray<{ provider: string; baseURL: string | null }>,
): string[] {
  return connections
    .filter((connection) => isOpenRouterBaseURL(connection.baseURL))
    .map((connection) => connection.provider);
}

export function hasSelectedOpenRouterProvider(
  models: ReadonlyArray<{ provider: string } | null | undefined>,
  openRouterProviders: ReadonlyArray<string>,
): boolean {
  if (openRouterProviders.length === 0) return false;
  const openRouterSet = new Set(openRouterProviders);
  return models.some((model) => model && openRouterSet.has(model.provider));
}

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
