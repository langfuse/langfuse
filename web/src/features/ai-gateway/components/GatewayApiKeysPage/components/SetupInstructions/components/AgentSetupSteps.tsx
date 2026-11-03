import { use } from "react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { Stepper } from "@/src/components/design-system/Stepper/Stepper";
import { GatewaySecretKeyContext } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/SetupInstructions/contexts/gatewaySecretKeyContext";
import { GATEWAY_KEY_PLACEHOLDER } from "@/src/features/ai-gateway/constants/agentSetupInstructions";
import type {
  AgentSetupInstructions,
  AgentSetupStep,
} from "@/src/features/ai-gateway/types/agentSetupInstructions";
import { StepCodeSection } from "./StepCodeSection";

const REPLACE_KEY_HINT = `Replace ${GATEWAY_KEY_PLACEHOLDER} with your gateway key.`;

type AgentSetupStepsProps = {
  instructions: AgentSetupInstructions;
  onAfterStepCopy?: (stepNumber: number) => void;
};

export function AgentSetupSteps({
  instructions,
  onAfterStepCopy,
}: AgentSetupStepsProps) {
  const secretKey = use(GatewaySecretKeyContext)?.value;

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
                  {describeStep(step, secretKey)}{" "}
                  <Button
                    variant="text"
                    text={step.link.label}
                    href={step.link.href}
                  />
                </>
              ) : (
                describeStep(step, secretKey)
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

/** Without a prefilled key, snippets carry the placeholder, so the step says to replace it. */
function describeStep(step: AgentSetupStep, secretKey: string | undefined) {
  const needsKeyHint =
    !secretKey && step.code?.includes(GATEWAY_KEY_PLACEHOLDER) === true;
  return [step.description, needsKeyHint ? REPLACE_KEY_HINT : undefined]
    .filter(Boolean)
    .join(" ");
}
