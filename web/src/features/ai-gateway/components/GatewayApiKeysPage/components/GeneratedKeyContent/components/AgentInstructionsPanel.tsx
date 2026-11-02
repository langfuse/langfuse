import { ExpandableContentPeek } from "@/src/components/design-system/ExpandableContentPeek/ExpandableContentPeek";
import type { AgentSetupInstructions } from "@/src/features/ai-gateway/types/agentSetupInstructions";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { AgentSetupSteps } from "./AgentSetupSteps";
import { CopyForAgentButton } from "./CopyForAgentButton";

type AgentInstructionsPanelProps = {
  organizationId: string;
  instructions: AgentSetupInstructions;
};

export function AgentInstructionsPanel({
  organizationId,
  instructions,
}: AgentInstructionsPanelProps) {
  const capture = usePostHogClientCapture();
  const agent = { orgId: organizationId, agentId: instructions.id };

  return (
    <div className="flex flex-col items-start gap-3">
      <CopyForAgentButton
        instructions={instructions}
        onAfterCopy={() =>
          capture("ai_gateway:agent_setup_instructions_copied", {
            ...agent,
            source: "copy_for_agent",
          })
        }
      />
      {/* Inactive tabs unmount, so switching tabs collapses the peek again. */}
      <div className="w-full">
        <ExpandableContentPeek
          expandLabel="Show all steps"
          onAfterExpand={() =>
            capture("ai_gateway:agent_setup_instructions_viewed", {
              ...agent,
              hasProviderWarning: instructions.warning !== undefined,
            })
          }
        >
          <AgentSetupSteps
            instructions={instructions}
            onAfterStepCopy={(stepNumber) =>
              capture("ai_gateway:agent_setup_instructions_copied", {
                ...agent,
                source: "step_code",
                stepNumber,
              })
            }
          />
        </ExpandableContentPeek>
      </div>
    </div>
  );
}
