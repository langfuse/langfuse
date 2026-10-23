import { ExpandableContentPeek } from "@/src/components/design-system/ExpandableContentPeek/ExpandableContentPeek";
import type { AgentSetupInstructions } from "@/src/features/ai-gateway/types/agentSetupInstructions";
import { AgentSetupSteps } from "./AgentSetupSteps";
import { CopyForAgentButton } from "./CopyForAgentButton";

type AgentInstructionsPanelProps = {
  instructions: AgentSetupInstructions;
};

export function AgentInstructionsPanel({
  instructions,
}: AgentInstructionsPanelProps) {
  return (
    <div className="flex flex-col items-start gap-3">
      <CopyForAgentButton instructions={instructions} />
      {/* Inactive tabs unmount, so switching tabs collapses the peek again. */}
      <div className="w-full">
        <ExpandableContentPeek expandLabel="Show all steps">
          <AgentSetupSteps instructions={instructions} />
        </ExpandableContentPeek>
      </div>
    </div>
  );
}
