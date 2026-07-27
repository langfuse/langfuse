import { useCanUseInAppAgent } from "@/src/ee/features/in-app-agent/components/InAppAiAgentProvider";
import { useProjectV4SdkData } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import { api } from "@/src/utils/api";

const EVAL_UPGRADE_ASSISTANT_PROMPT =
  "I want to start my eval upgrade. Use the langfuse skill. Please review this project's deprecated evaluators (trace- and dataset-level), that are both ACTIVE and run on NEW time scope, and help me migrate them to the new targets — observations and experiments. Check with me before applying any changes.";

const UPGRADE_OUTSIDE_PLATFORM_PROMPT =
  "I want to upgrade my Langfuse setup to v4, but parts of it must be upgraded outside of Langfuse, which you cannot do from here. Please tell me to copy the upgrade prompt from the 'Copy prompt for agents' button in the v4 migration panel and run it in my coding editor (Cursor, Codex, Claude Code).";

/**
 * Whether the in-app assistant can complete the remaining v4 upgrade.
 * True only when ALL of:
 * - deprecated evals remain AND the SDK upgrade is already done, and
 * - every remaining legacy eval is trivially repointable (dataset target, or
 *   a variable mapping that reads from a single observation) — computed
 *   server-side as `allAssistantMigratable`.
 *
 * `assistantPrompt` is what the "upgrade now" entry points submit to the
 * assistant: the eval-upgrade instruction when it can do the work, otherwise
 * an instruction to point the user at the coding-agent prompt.
 */
export function useEvalUpgradeAssistantPlan(params: {
  projectId: string | undefined;
  orgId: string | undefined;
  enabled: boolean;
}) {
  const canUseAssistant = useCanUseInAppAgent();
  const sdk = useProjectV4SdkData(params);
  const evalQuery = api.v4Transition.traceLevelEvalSummary.useQuery(
    { projectId: params.projectId ?? "" },
    { enabled: params.enabled && Boolean(params.projectId) },
  );

  const sdkUpgradeDone =
    sdk.status === "latest" || sdk.status === "otel_realtime";
  const evalsPending = (evalQuery.data?.traceLevelEvalCount ?? 0) > 0;
  const assistantCanUpgrade =
    canUseAssistant &&
    sdkUpgradeDone &&
    evalsPending &&
    evalQuery.data?.allAssistantMigratable === true;

  return {
    canUseAssistant,
    assistantCanUpgrade,
    assistantPrompt: assistantCanUpgrade
      ? EVAL_UPGRADE_ASSISTANT_PROMPT
      : UPGRADE_OUTSIDE_PLATFORM_PROMPT,
  };
}
