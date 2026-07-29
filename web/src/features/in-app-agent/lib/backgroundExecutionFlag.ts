import { useBrowserStorageValue } from "@/src/features/events/lib/appRootDefaultStorage";

/**
 * Opt-in flag for running the assistant on the background execution path
 * (worker-executed runs, cursor-based streaming, refresh-survivable turns).
 *
 * Deliberately a client-only localStorage flag, not a server feature flag:
 * the endpoints behind it ship live and are protected by the ordinary auth
 * chain (owner-only, `in-app-agent` entitlement, `aiFeaturesEnabled`, cloud
 * region, rate limit), so exposure is a stability question, not a security
 * one. Canary is therefore a binary opt-in followed by a default flip at GA.
 *
 * Set it from devtools:
 *   localStorage.setItem("langfuse-in-app-agent-background-execution", "true")
 *
 * Read through `useBrowserStorageValue` rather than `useLocalStorage`: it is
 * effect-free, its server snapshot is `null` so SSR always renders flag-off,
 * and it re-renders on same-tab writes — which is what makes toggling the key
 * in devtools take effect without a reload.
 */
export const IN_APP_AGENT_BACKGROUND_EXECUTION_STORAGE_KEY =
  "langfuse-in-app-agent-background-execution";

export function useInAppAgentBackgroundExecutionEnabled(): boolean {
  return (
    useBrowserStorageValue(
      "localStorage",
      IN_APP_AGENT_BACKGROUND_EXECUTION_STORAGE_KEY,
    ) === "true"
  );
}
