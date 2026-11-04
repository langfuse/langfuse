import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Skeleton } from "@/src/components/ui/skeleton";
import { SetupInstructionsTabs } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/SetupInstructions/components/SetupInstructionsTabs/SetupInstructionsTabs";
import {
  type GatewaySecretKey,
  GatewaySecretKeyContext,
} from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/SetupInstructions/contexts/gatewaySecretKeyContext";
import { useAgentSetupInstructions } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/SetupInstructions/hooks/useAgentSetupInstructions";

type SetupInstructionsProps = {
  organizationId: string;
  defaultExpanded?: boolean;
  /** Fills the snippets with this key instead of the placeholder. */
  secretKey?: GatewaySecretKey;
};

export function SetupInstructions({
  organizationId,
  defaultExpanded,
  secretKey,
}: SetupInstructionsProps) {
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
    <GatewaySecretKeyContext value={secretKey}>
      <SetupInstructionsTabs
        organizationId={organizationId}
        instructions={instructions}
        defaultExpanded={defaultExpanded}
      />
    </GatewaySecretKeyContext>
  );
}
