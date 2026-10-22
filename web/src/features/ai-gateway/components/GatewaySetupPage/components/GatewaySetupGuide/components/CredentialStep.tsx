import { Plus } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { Stepper } from "@/src/components/design-system/Stepper/Stepper";
import { GATEWAY_SETUP_DOCS_URL } from "@/src/features/ai-gateway/components/GatewaySetupPage/constants/gatewaySetupDocsUrl";
import type { getSetupStepStatus } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupGuide/fns/getSetupStepStatus";
import { ProviderDialogController } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/ProviderDialogController/ProviderDialogController";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";

export type CredentialStepProps = {
  status: ReturnType<typeof getSetupStepStatus>;
  organizationId: string;
  firstConnection: Pick<GatewayConnection, "provider"> | undefined;
};

export function CredentialStep({
  status,
  organizationId,
  firstConnection,
}: CredentialStepProps) {
  const summary =
    status === "complete" && firstConnection
      ? `${providerLabels[firstConnection.provider]} credential added`
      : undefined;

  return (
    <Stepper
      number={2}
      title="Add a provider credential"
      size="sm"
      status={status}
      isCollapsible={false}
      docsHref={GATEWAY_SETUP_DOCS_URL}
      description={summary}
    >
      {status === "current" ? (
        <div className="flex flex-col items-start gap-3 pt-1">
          <p className="text-muted-foreground text-xs">
            The gateway routes requests with your own provider keys. They are
            validated against the provider when saved.
          </p>
          <ProviderDialogController organizationId={organizationId}>
            {({ openAddDialog }) => (
              <Button
                text="Add credential"
                icon={Plus}
                onClick={openAddDialog}
              />
            )}
          </ProviderDialogController>
        </div>
      ) : null}
    </Stepper>
  );
}
