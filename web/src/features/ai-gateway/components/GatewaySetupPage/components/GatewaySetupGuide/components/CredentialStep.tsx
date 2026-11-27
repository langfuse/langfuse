import { Plus } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import {
  Stepper,
  type RichDescription,
} from "@/src/components/design-system/Stepper/Stepper";
import { GATEWAY_SETUP } from "@/src/features/ai-gateway/components/GatewaySetupPage/constants/gatewaySetup";
import type { getSetupStepStatus } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/fns/getSetupStepStatus";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import { formatAvailableGatewayProviderNames } from "@/src/features/ai-gateway/fns/formatAvailableGatewayProviderNames";
import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";

export type CredentialStepProps = {
  status: ReturnType<typeof getSetupStepStatus>;
  firstConnection: Pick<GatewayConnection, "provider"> | undefined;
  onAddCredential: () => void;
};

function credentialStepDescription({
  status,
  firstConnection,
}: Pick<CredentialStepProps, "status" | "firstConnection">): RichDescription {
  if (status === "complete" && firstConnection) {
    return `${providerLabels[firstConnection.provider]} connection added`;
  }
  const providerNames = formatAvailableGatewayProviderNames();
  const text = `Connect ${providerNames} with an API key. Available models are loaded from the provider.`;
  if (status !== "current") return text;
  return [
    { type: "text", text: `${text} ` },
    {
      type: "link",
      text: "How provider connections work",
      href: GATEWAY_SETUP.docsUrl,
    },
  ];
}

export function CredentialStep({
  status,
  firstConnection,
  onAddCredential,
}: CredentialStepProps) {
  return (
    <Stepper
      number={2}
      title="Add a provider connection"
      status={status}
      isCollapsible={false}
      description={credentialStepDescription({ status, firstConnection })}
    >
      {status === "current" ? (
        <div className="flex flex-col items-start pt-1">
          <Button text="Add connection" icon={Plus} onClick={onAddCredential} />
        </div>
      ) : null}
    </Stepper>
  );
}
