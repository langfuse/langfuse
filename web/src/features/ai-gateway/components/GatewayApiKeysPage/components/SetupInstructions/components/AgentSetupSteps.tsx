import { use } from "react";

import { Banner } from "@/src/components/design-system/Banner/Banner";
import {
  Stepper,
  type RichDescription,
} from "@/src/components/design-system/Stepper/Stepper";
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
        <Banner variant="warning">{instructions.warning}</Banner>
      ) : null}
      <div className="flex flex-col">
        {instructions.steps.map((step, index) => (
          <Stepper
            key={step.title}
            number={index + 1}
            title={step.title}
            description={describeStep(step, secretKey)}
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
function describeStep(
  step: AgentSetupStep,
  secretKey: string | undefined,
): RichDescription {
  const needsKeyHint =
    !secretKey && step.code?.includes(GATEWAY_KEY_PLACEHOLDER) === true;
  const text = [step.description, needsKeyHint ? REPLACE_KEY_HINT : undefined]
    .filter(Boolean)
    .join(" ");
  if (!step.link) return text;
  return [
    ...(text ? [{ type: "text" as const, text: `${text} ` }] : []),
    { type: "link", text: step.link.label, href: step.link.href },
  ];
}
