import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { Skeleton } from "@/src/components/ui/skeleton";
import { SetupInstructionsTabs } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GeneratedKeyContent/components/SetupInstructionsTabs/SetupInstructionsTabs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { MaskedGatewayKey } from "./components/MaskedGatewayKey";
import { useAgentSetupInstructions } from "./hooks/useAgentSetupInstructions";

type SetupInstructionsProps = {
  organizationId: string;
};

function SetupInstructions({ organizationId }: SetupInstructionsProps) {
  const { instructions, isPending, isError } =
    useAgentSetupInstructions(organizationId);

  if (isPending) {
    return <Skeleton className="h-48 w-full" />;
  }
  if (isError || !instructions) {
    return (
      <Alert variant="destructive">
        <Alert.Title>Setup instructions could not be loaded</Alert.Title>
        <Alert.Description>
          Your key works. Follow the docs to connect your tools.
        </Alert.Description>
      </Alert>
    );
  }

  return (
    <SetupInstructionsTabs
      organizationId={organizationId}
      instructions={instructions}
    />
  );
}

type GeneratedKeyContentProps = {
  organizationId: string;
  secretKey: string;
};

export function GeneratedKeyContent({
  organizationId,
  secretKey,
}: GeneratedKeyContentProps) {
  const capture = usePostHogClientCapture();

  return (
    <Dialog.Body>
      <p className="text-muted-foreground">
        Copy the key now. It is shown only once.
      </p>
      <MaskedGatewayKey
        secretKey={secretKey}
        onAfterCopy={() =>
          capture("ai_gateway:api_key_secret_copied", { orgId: organizationId })
        }
        onAfterReveal={() =>
          capture("ai_gateway:api_key_secret_revealed", {
            orgId: organizationId,
          })
        }
      />
      <hr className="-mx-4" />
      <SetupInstructions organizationId={organizationId} />
    </Dialog.Body>
  );
}
