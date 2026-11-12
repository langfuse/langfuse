import { Button } from "@/src/components/design-system/Button/Button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ConnectedGatewayNotSetUpNotice } from "@/src/features/ai-gateway/components/GatewayNotSetUpNotice/ConnectedGatewayNotSetUpNotice";
import { GATEWAY_API_KEYS_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { CreateGatewayApiKeyDialogController } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/CreateGatewayApiKeyDialogController";
import { ConnectedGatewayCreateFirstKeyPlaceholder } from "@/src/features/ai-gateway/components/GatewayCreateFirstKeyPlaceholder/ConnectedGatewayCreateFirstKeyPlaceholder";
import { ConnectedGatewayApiKeysTable } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeysTable/ConnectedGatewayApiKeysTable";

export function GatewayApiKeysPage({
  organizationId,
}: {
  organizationId: string;
}) {
  const { canManageGateway, isIngestionConfigured, isSetupStatusPending } =
    useGatewaySettingsAccess(organizationId);

  if (isSetupStatusPending) {
    return <ApiKeysSkeleton />;
  }
  /** Managers are redirected to Setup by the settings route. */
  if (!canManageGateway && isIngestionConfigured === false) {
    return <ConnectedGatewayNotSetUpNotice />;
  }
  const description = (
    <p className="text-muted-foreground text-sm">
      {canManageGateway
        ? "Gateway keys authenticate requests to the AI Gateway only. User keys are revoked when their owner leaves the organization; service account keys keep working."
        : "Your gateway keys authenticate requests to the AI Gateway only. They are revoked when you leave the organization or lose gateway access."}{" "}
      <Button
        variant="text"
        text="How gateway keys work"
        href={GATEWAY_API_KEYS_DOCS_URL}
      />
    </p>
  );
  if (canManageGateway) {
    return (
      <ConnectedGatewayApiKeysTable
        key={organizationId}
        organizationId={organizationId}
        description={description}
      />
    );
  }
  // Above the table, so the new key's dialog stays open when the placeholder gives way.
  return (
    <CreateGatewayApiKeyDialogController organizationId={organizationId}>
      {({ openDialog }) => (
        <ConnectedGatewayApiKeysTable
          key={organizationId}
          organizationId={organizationId}
          description={description}
          emptyState={
            <ConnectedGatewayCreateFirstKeyPlaceholder
              organizationId={organizationId}
              onCreateKey={openDialog}
            />
          }
        />
      )}
    </CreateGatewayApiKeyDialogController>
  );
}

function ApiKeysSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
