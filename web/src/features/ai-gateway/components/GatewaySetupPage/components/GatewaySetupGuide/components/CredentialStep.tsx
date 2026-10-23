import { Plus } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { Stepper } from "@/src/components/design-system/Stepper/Stepper";
import { GATEWAY_SETUP } from "@/src/features/ai-gateway/components/GatewaySetupPage/constants/gatewaySetup";
import type { getSetupStepStatus } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/fns/getSetupStepStatus";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";

export type CredentialStepProps = {
  status: ReturnType<typeof getSetupStepStatus>;
  firstConnection: Pick<GatewayConnection, "provider"> | undefined;
  onAddCredential: () => void;
};

function CredentialStepDescription({
  status,
  firstConnection,
}: Pick<CredentialStepProps, "status" | "firstConnection">) {
  if (status === "complete" && firstConnection) {
    return <>{providerLabels[firstConnection.provider]} credential added</>;
  }
  return (
    <>
      Connect {Object.values(providerLabels).join(" or ")} with an API key.
      Available models are loaded from the provider.
      {status === "current" ? (
        <>
          {" "}
          <Button
            variant="text"
            size="sm"
            text="How provider credentials work"
            href={GATEWAY_SETUP.docsUrl}
          />
        </>
      ) : null}
    </>
  );
}

export function CredentialStep({
  status,
  firstConnection,
  onAddCredential,
}: CredentialStepProps) {
  return (
    <Stepper
      number={2}
      title="Add a provider credential"
      size="sm"
      status={status}
      isCollapsible={false}
      description={
        <CredentialStepDescription
          status={status}
          firstConnection={firstConnection}
        />
      }
    >
      {status === "current" ? (
        <div className="flex flex-col items-start pt-1">
          <Button text="Add credential" icon={Plus} onClick={onAddCredential} />
        </div>
      ) : null}
    </Stepper>
  );
}
