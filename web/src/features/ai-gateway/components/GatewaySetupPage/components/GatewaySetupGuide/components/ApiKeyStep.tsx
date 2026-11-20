import { Plus } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { Stepper } from "@/src/components/design-system/Stepper/Stepper";
import type { getSetupStepStatus } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/fns/getSetupStepStatus";

export type ApiKeyStepProps = {
  status: ReturnType<typeof getSetupStepStatus>;
  onCreateKey: () => void;
  onSkipKey: () => void;
};

export function ApiKeyStep({
  status,
  onCreateKey,
  onSkipKey,
}: ApiKeyStepProps) {
  return (
    <Stepper
      number={5}
      title="Create your own key"
      status={status}
      isCollapsible={false}
      description="Use it in Claude Code, Codex, OpenCode, or your own apps to send your first request."
    >
      {status === "current" ? (
        <div className="flex items-center gap-2 pt-1">
          <Button text="Create key" icon={Plus} onClick={onCreateKey} />
          <Button text="Skip for now" variant="secondary" onClick={onSkipKey} />
        </div>
      ) : null}
    </Stepper>
  );
}
