import { useSession } from "next-auth/react";

import Header from "@/src/app/shell/layouts/header";
import { Alert } from "@/src/app/design-system/Alert/Alert";
import { Button } from "@/src/app/design-system/legacy-primitives/button";
import { Skeleton } from "@/src/app/design-system/legacy-primitives/skeleton";
import { GatewayConfigurationView } from "@/src/ai/gateway/management-ui/components/GatewayConfigurationPage/components/GatewayConfigurationView/GatewayConfigurationView";
import { showSuccessToast } from "@/src/app/shell/notifications";
import { api, reportNonTrpcError } from "@/src/app/utils/api";

type Project = {
  id: string;
  name: string;
  deletedAt?: Date | string | null;
};

export function GatewayConfigurationPage({
  organizationId,
  projects,
}: {
  organizationId: string;
  projects: Project[];
}) {
  const session = useSession();
  const configQuery = api.aiGateway.getConfig.useQuery({
    orgId: organizationId,
  });
  const utils = api.useUtils();
  const createProject = api.projects.create.useMutation();
  const updateConfig = api.aiGateway.updateConfig.useMutation();

  async function saveGatewayConfig(params: {
    projectId: string | null;
    ingestionMode: "USAGE" | "FULL";
  }) {
    await updateConfig.mutateAsync({
      orgId: organizationId,
      defaultIngestionProjectId: params.projectId,
      ingestionMode: params.ingestionMode,
    });
    await utils.aiGateway.getConfig.invalidate({ orgId: organizationId });
    showSuccessToast({
      operation: "gateway_configuration.save",
      title: "Gateway configuration saved",
      description: "New gateway requests will use this configuration.",
    });
  }

  if (configQuery.isPending) {
    return <ConfigurationSkeleton />;
  }

  if (configQuery.isError) {
    return (
      <div className="flex flex-col gap-4">
        <Header title="AI Gateway configuration" />
        <Alert variant="destructive">
          <Alert.Title>Configuration could not be loaded</Alert.Title>
          <Alert.Description>
            Retry the request to continue configuring the gateway.
          </Alert.Description>
        </Alert>
        <Button
          className="w-fit"
          variant="secondary"
          onClick={() => configQuery.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  const { config, gatewayBaseUrl } = configQuery.data;
  return (
    <GatewayConfigurationView
      key={`${config?.updatedAt?.toISOString() ?? "new"}:${config?.defaultIngestionProjectId ?? "none"}:${config?.ingestionMode ?? "USAGE"}`}
      projects={projects}
      gatewayBaseUrl={gatewayBaseUrl}
      initialProjectId={config?.defaultIngestionProjectId ?? null}
      initialIngestionMode={config?.ingestionMode ?? "USAGE"}
      isSaving={createProject.isPending || updateConfig.isPending}
      saveError={createProject.isError || updateConfig.isError}
      onSave={async ({ projectId, ingestionMode }) => {
        try {
          await saveGatewayConfig({ projectId, ingestionMode });
        } catch (error) {
          reportNonTrpcError(error, "ai-gateway-configuration");
        }
      }}
      onCreateProject={async ({ projectName, ingestionMode }) => {
        try {
          const project = await createProject.mutateAsync({
            orgId: organizationId,
            name: projectName,
          });
          await session.update();
          await saveGatewayConfig({ projectId: project.id, ingestionMode });
        } catch (error) {
          reportNonTrpcError(error, "ai-gateway-configuration");
        }
      }}
    />
  );
}

function ConfigurationSkeleton() {
  return (
    <div className="flex flex-col gap-6" data-testid="gateway-config-loading">
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-40 w-full" />
      <div className="grid gap-3 md:grid-cols-3">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    </div>
  );
}
