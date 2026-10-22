import { Alert } from "@/src/components/design-system/Alert/Alert";
import { CodeSection } from "@/src/components/design-system/CodeSection/CodeSection";
import { Stepper } from "@/src/components/design-system/Stepper/Stepper";
import type { AgentSetupInstructions } from "@/src/features/ai-gateway/types/agentSetupInstructions";

type AgentSetupStepsProps = {
  instructions: AgentSetupInstructions;
};

export function AgentSetupSteps({ instructions }: AgentSetupStepsProps) {
  return (
    <div className="flex flex-col gap-3">
      {instructions.warning ? (
        <Alert variant="warning" size="sm">
          <Alert.Description>{instructions.warning}</Alert.Description>
        </Alert>
      ) : null}
      <div className="flex flex-col">
        {instructions.steps.map((step, index) => (
          <Stepper
            key={step.title}
            number={index + 1}
            title={step.title}
            description={step.description}
            variant="outline"
            size="sm"
            isCollapsible={false}
            compactBottomSpacing
          >
            <CodeSection
              variant="outline"
              content={step.code}
              shouldWrapLines={false}
            />
          </Stepper>
        ))}
      </div>
    </div>
  );
}
