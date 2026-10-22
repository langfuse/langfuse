import { useRouter } from "next/router";

import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewaySetupContent } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewaySetupContent";
import { GATEWAY_SETUP_COPY } from "@/src/features/ai-gateway/components/GatewaySetupPage/constants/gatewaySetupCopy";
import type { GatewayProject } from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";
import { api } from "@/src/utils/api";

export type GatewaySetupPageProps = {
  organizationId: string;
  projects: Array<GatewayProject & { deletedAt?: Date | string | null }>;
};

export function GatewaySetupPage({
  organizationId,
  projects,
}: GatewaySetupPageProps) {
  const router = useRouter();
  const connectionId =
    typeof router.query.connectionId === "string"
      ? router.query.connectionId
      : undefined;
  const configQuery = api.aiGateway.getConfig.useQuery({
    orgId: organizationId,
  });

  function handleRetry() {
    configQuery.refetch();
  }

  if (configQuery.isPending) {
    return (
      <div className="flex flex-col gap-6" data-testid="gateway-setup-loading">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (configQuery.isError) {
    return (
      <div className="flex flex-col items-start gap-4">
        <Header title={GATEWAY_SETUP_COPY.title} />
        <Alert variant="destructive">
          <Alert.Title>Gateway setup could not be loaded</Alert.Title>
          <Alert.Description>
            Retry the request to continue setting up the gateway.
          </Alert.Description>
        </Alert>
        <Button text="Retry" variant="secondary" onClick={handleRetry} />
      </div>
    );
  }

  return (
    <GatewaySetupContent
      organizationId={organizationId}
      connectionId={connectionId}
      config={configQuery.data.config}
      projects={projects.filter((project) => !project.deletedAt)}
    />
  );
}
