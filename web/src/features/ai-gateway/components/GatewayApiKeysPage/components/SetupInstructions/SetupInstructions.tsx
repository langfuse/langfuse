import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Skeleton } from "@/src/components/ui/skeleton";
import { SetupInstructionsTabs } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/SetupInstructions/components/SetupInstructionsTabs/SetupInstructionsTabs";
import { useAgentSetupInstructions } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/SetupInstructions/hooks/useAgentSetupInstructions";

type SetupInstructionsProps = {
  organizationId: string;
  defaultExpanded?: boolean;
};

export function SetupInstructions({
  organizationId,
  defaultExpanded,
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
    <SetupInstructionsTabs
      organizationId={organizationId}
      instructions={instructions}
      defaultExpanded={defaultExpanded}
    />
  );
}
