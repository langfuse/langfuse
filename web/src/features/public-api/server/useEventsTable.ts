import { env } from "@/src/env.mjs";
import { V4_DEFAULT_ENABLED_FROM_AT } from "@/src/features/events/lib/v4Rollout";

export function shouldUseEventsTable(params: {
  queryParam?: boolean;
  orgCreatedAt?: string | null;
}): boolean {
  // Explicit query param takes precedence
  if (params.queryParam !== undefined && params.queryParam !== null) {
    return params.queryParam === true;
  }
  // When the env-var gate is enabled, use events for orgs created after the v4 cutoff
  if (env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true") {
    return (
      !!params.orgCreatedAt &&
      new Date(params.orgCreatedAt) >= V4_DEFAULT_ENABLED_FROM_AT
    );
  }
  return false;
}
