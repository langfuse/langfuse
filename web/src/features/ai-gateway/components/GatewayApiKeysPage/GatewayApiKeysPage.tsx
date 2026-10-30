import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/design-system/Button/Button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewayNotSetUpNotice } from "@/src/features/ai-gateway/components/GatewayNotSetUpNotice/GatewayNotSetUpNotice";
import { GATEWAY_API_KEYS_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { useHasOrganizationAccess } from "@/src/features/rbac";
import { ConnectedGatewayApiKeysTable } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeysTable/ConnectedGatewayApiKeysTable";

export function GatewayApiKeysPage({
  organizationId,
}: {
  organizationId: string;
}) {
  const { canManageGateway, isIngestionConfigured, isSetupStatusPending } =
    useGatewaySettingsAccess(organizationId);
  const canInviteMembers = useHasOrganizationAccess({
    organizationId,
    scope: "organizationMembers:CUD",
  });

  if (isSetupStatusPending) {
    return <ApiKeysSkeleton />;
  }
  /** Managers are redirected to Setup by the settings route. */
  if (!canManageGateway && isIngestionConfigured === false) {
    return <GatewayNotSetUpNotice title="Gateway API keys" />;
  }
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Header title="Gateway API keys" />
        <p className="text-muted-foreground text-sm">
          {canManageGateway
            ? "Keys authenticate requests to the AI Gateway only. User keys are revoked when their owner leaves the organization; service account keys keep working."
            : "Your keys authenticate requests to the AI Gateway only. They are revoked when you leave the organization or lose gateway access."}{" "}
          <Button
            variant="text"
            text="How gateway keys work"
            href={GATEWAY_API_KEYS_DOCS_URL}
          />
        </p>
      </div>
      <ConnectedGatewayApiKeysTable
        key={organizationId}
        organizationId={organizationId}
        canInvite={canManageGateway && canInviteMembers}
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
