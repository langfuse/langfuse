import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewayConfigurationView } from "@/src/features/llm-gateway/components/GatewayConfigurationPage/components/GatewayConfigurationView/GatewayConfigurationView";
import { showSuccessToast } from "@/src/features/notifications";
import { api, reportNonTrpcError } from "@/src/utils/api";

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
  const configQuery = api.llmGateway.getConfig.useQuery({
    orgId: organizationId,
  });
  const utils = api.useUtils();
  const updateConfig = api.llmGateway.updateConfig.useMutation();

  if (configQuery.isPending) {
    return <ConfigurationSkeleton />;
  }

  if (configQuery.isError) {
    return (
      <div className="flex flex-col gap-4">
        <Header title="LLM Gateway configuration" />
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

  const config = configQuery.data;
  return (
    <GatewayConfigurationView
      key={`${config?.updatedAt?.toISOString() ?? "new"}:${config?.defaultIngestionProjectId ?? "none"}:${config?.instrumentationMode ?? "USAGE"}`}
      projects={projects}
      initialProjectId={config?.defaultIngestionProjectId ?? null}
      initialMode={config?.instrumentationMode ?? "USAGE"}
      isSaving={updateConfig.isPending}
      saveError={updateConfig.isError}
      onSave={async ({ projectId, createProjectName, mode }) => {
        try {
          await updateConfig.mutateAsync({
            orgId: organizationId,
            defaultIngestionProjectId: projectId,
            ...(createProjectName ? { createProjectName } : {}),
            instrumentationMode: mode,
          });
          await utils.llmGateway.getConfig.invalidate({
            orgId: organizationId,
          });
          showSuccessToast({
            title: "Gateway configuration saved",
            description: "New gateway requests will use this configuration.",
          });
        } catch (error) {
          reportNonTrpcError(error, "llm-gateway-configuration");
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
