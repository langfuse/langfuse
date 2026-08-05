import { useCanUseInAppAgent } from "@/src/features/in-app-agent";
import { useProjectV4SdkData } from "@/src/features/v4-migration/hooks/useV4MigrationData";
import { api } from "@/src/utils/api";

const V4_MIGRATION_SKILL_URL =
  "https://raw.githubusercontent.com/langfuse/skills/main/skills/langfuse/references/v4-project-migration.md";

/** Prompt for external coding agents (Cursor, Codex, Claude Code) covering
 * the codebase-side migration work the in-app assistant cannot do. The
 * canonical workflow lives in the Langfuse skill repository; this prompt is
 * also embedded verbatim below so users can copy it from the assistant. */
export const V4_CODING_AGENT_PROMPT = `Migrate this repository's Langfuse setup to v4.

If the Langfuse skill is installed, use it and read references/v4-project-migration.md.
Otherwise, fetch and follow the canonical migration workflow:
${V4_MIGRATION_SKILL_URL}

Work in code-only mode unless Langfuse project access is already configured. Do not stop to install the Langfuse CLI or request credentials. Complete and test all repository changes you can verify, then return the seven-row readiness report required by the workflow and mark project-dependent checks as blocked.`;

const EVAL_UPGRADE_ASSISTANT_PROMPT =
  "I want to start my eval upgrade. Use the langfuse skill. Please review this project's deprecated evaluators (trace- and dataset-level), that are both ACTIVE and run on NEW time scope, and help me migrate them to the new targets — observations and experiments. Check with me before applying any changes.";

const SDK_FIRST_CHOICE_PROMPT = `I want to upgrade my Langfuse setup to v4. My deprecated evaluators can be migrated here with your help, but my SDK upgrade hasn't happened yet — that part has to be done in my own codebase. Start by asking me which order I want:
- Recommended: SDK first. I upgrade the SDK outside Langfuse, then come back and you migrate the evals. If I choose this, give me the coding-editor prompt below to copy.
- Evals first is also fine. You migrate the evaluators now; the legacy and new evaluators run side by side, and the new ones start producing results as soon as the SDK upgrade lands.
If I choose evals first, use the langfuse skill, review this project's deprecated evaluators (trace- and dataset-level), that are both ACTIVE and run on NEW time scope, and migrate them to observations and experiments, checking with me before each change.

Coding-editor prompt for the SDK upgrade:
"""
${V4_CODING_AGENT_PROMPT}
"""`;

const UPGRADE_OUTSIDE_PLATFORM_PROMPT = `I want to upgrade my Langfuse setup to v4, but parts of it must be done outside of Langfuse, which you cannot do from here. In your answer, include the following prompt verbatim so I can copy it into my coding editor (Cursor, Codex, Claude Code):
"""
${V4_CODING_AGENT_PROMPT}
"""
Also ask me whether I would instead like to complete the upgrade by deactivating or deleting all deprecated evaluators — if I say yes, help me do that here, confirming each one with me first.`;

export type V4UpgradeAssistantMode =
  | "evals-ready"
  | "sdk-first-choice"
  | "outside";

/**
 * Plans how the in-app assistant participates in the v4 upgrade:
 * - "evals-ready": deprecated evals remain, all repointable
 *   → the assistant migrates the evals
 * - "sdk-first-choice": the SDK upgrade is
 *   known to be pending → the assistant asks whether to do the SDK first
 *   (recommended, outside Langfuse) or migrate evals now; legacy and new
 *   evaluators run side by side until the SDK upgrade lands.
 * - "outside": everything else → the assistant hands over the coding-editor
 *   prompt verbatim and offers deactivating/deleting the deprecated evals
 *   as the alternative.
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

  const sdkUpgradeKnownPending =
    sdk.status === "legacy" ||
    sdk.status === "otel_header_required" ||
    sdk.upgradeRequiredCount > 0;
  const evalsPending = (evalQuery.data?.traceLevelEvalCount ?? 0) > 0;

  const mode: V4UpgradeAssistantMode = evalsPending
    ? sdkUpgradeKnownPending
      ? "sdk-first-choice"
      : "evals-ready"
    : "outside";

  return {
    canUseAssistant,
    mode,
    /** Show the "Migrate with assistant" CTA in the migration panel. */
    showAssistantButton: canUseAssistant && mode !== "outside",
    assistantPrompt:
      mode === "evals-ready"
        ? EVAL_UPGRADE_ASSISTANT_PROMPT
        : mode === "sdk-first-choice"
          ? SDK_FIRST_CHOICE_PROMPT
          : UPGRADE_OUTSIDE_PLATFORM_PROMPT,
  };
}
