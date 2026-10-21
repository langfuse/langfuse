import Header from "@/src/components/layouts/header";
import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewayNotSetUpNotice } from "@/src/features/ai-gateway/components/GatewayNotSetUpNotice/GatewayNotSetUpNotice";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { ConnectedGatewayApiKeysTable } from "./components/GatewayApiKeysTable/ConnectedGatewayApiKeysTable";

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
  /** Managers are redirected to Configuration by the settings route. */
  if (!canManageGateway && isIngestionConfigured === false) {
    return <GatewayNotSetUpNotice title="Gateway API keys" />;
  }
  return (
    <div className="flex flex-col gap-4">
      <Header title="Gateway API keys" />
      <p className="text-muted-foreground text-sm">
        {canManageGateway
          ? "These organization keys authenticate requests to the AI Gateway only. Each key belongs to the member who created it and is revoked when they leave the organization."
          : "Your keys authenticate requests to the AI Gateway only. They are revoked when you leave the organization or lose gateway access."}
      </p>
      <ConnectedGatewayApiKeysTable
        key={organizationId}
        organizationId={organizationId}
      />
    </div>
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
