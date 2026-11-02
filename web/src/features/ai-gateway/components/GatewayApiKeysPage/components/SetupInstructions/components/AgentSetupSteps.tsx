import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { Stepper } from "@/src/components/design-system/Stepper/Stepper";
import type { AgentSetupInstructions } from "@/src/features/ai-gateway/types/agentSetupInstructions";
import { StepCodeSection } from "./StepCodeSection";

type AgentSetupStepsProps = {
  instructions: AgentSetupInstructions;
  onAfterStepCopy?: (stepNumber: number) => void;
};

export function AgentSetupSteps({
  instructions,
  onAfterStepCopy,
}: AgentSetupStepsProps) {
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
            description={
              step.link ? (
                <>
                  {step.description}{" "}
                  <Button
                    variant="text"
                    text={step.link.label}
                    href={step.link.href}
                  />
                </>
              ) : (
                step.description
              )
            }
            variant="outline"
            size="sm"
            isCollapsible={false}
            compactBottomSpacing
          >
            {step.code === undefined ? null : (
              <StepCodeSection
                code={step.code}
                language={step.language}
                onAfterCopy={() => onAfterStepCopy?.(index + 1)}
              />
            )}
          </Stepper>
        ))}
      </div>
    </div>
  );
}
