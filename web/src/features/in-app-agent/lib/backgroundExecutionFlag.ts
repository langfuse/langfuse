import { useBrowserStorageValue } from "@/src/features/events/lib/appRootDefaultStorage";

// Internal dogfood switch; server authorization is independent of this flag.
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
