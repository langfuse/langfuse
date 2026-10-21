import { useSession } from "next-auth/react";

import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  GatewayConfigurationView,
  type IngestionMode,
} from "@/src/features/ai-gateway/components/GatewayConfigurationPage/components/GatewayConfigurationView/GatewayConfigurationView";
import { IngestionProjectSetupPlaceholder } from "@/src/features/ai-gateway/components/GatewayConfigurationPage/components/IngestionProjectSetupPlaceholder/IngestionProjectSetupPlaceholder";
import { showSuccessToast } from "@/src/features/notifications";
import { useLangfuseCloudRegion } from "@/src/features/organizations";
import { api, reportNonTrpcError } from "@/src/utils/api";

const CLOUD_INGESTION_MODES = ["USAGE", "FULL"] as const;
const SELF_HOSTED_INGESTION_MODES = ["NONE", "USAGE", "FULL"] as const;

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
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const configQuery = api.aiGateway.getConfig.useQuery({
    orgId: organizationId,
  });
  const utils = api.useUtils();
  const createProject = api.projects.create.useMutation();
  const updateConfig = api.aiGateway.updateConfig.useMutation();

  async function saveGatewayConfig(params: {
    projectId: string | null;
    ingestionMode: IngestionMode;
  }) {
    await updateConfig.mutateAsync({
      orgId: organizationId,
      defaultIngestionProjectId: params.projectId,
      ingestionMode: params.ingestionMode,
    });
    await Promise.all([
      utils.aiGateway.getConfig.invalidate({ orgId: organizationId }),
      utils.aiGateway.getSetupStatus.invalidate({ orgId: organizationId }),
    ]);
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
  const initialIngestionMode = config?.ingestionMode ?? "USAGE";

  async function handleCreateProject(params: {
    projectName: string;
    ingestionMode: IngestionMode;
  }) {
    try {
      const project = await createProject.mutateAsync({
        orgId: organizationId,
        name: params.projectName,
      });
      await session.update();
      await saveGatewayConfig({
        projectId: project.id,
        ingestionMode: params.ingestionMode,
      });
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-configuration");
    }
  }

  async function handleSelectProject(projectId: string) {
    try {
      await saveGatewayConfig({
        projectId,
        ingestionMode: initialIngestionMode,
      });
    } catch (error) {
      reportNonTrpcError(error, "ai-gateway-configuration");
    }
  }

  /** Cloud always captures traffic, so it needs a project; self-hosted can use `NONE`. */
  const showSetupPlaceholder =
    isLangfuseCloud &&
    !hasActiveIngestionProject(config?.defaultIngestionProject, organizationId);
  if (showSetupPlaceholder) {
    return (
      <IngestionProjectSetupPlaceholder
        ingestionMode={initialIngestionMode}
        isSaving={createProject.isPending || updateConfig.isPending}
        onCreate={handleCreateProject}
        projects={projects.filter((project) => !project.deletedAt)}
        onSelectProject={handleSelectProject}
      />
    );
  }

  return (
    <GatewayConfigurationView
      key={`${config?.updatedAt?.toISOString() ?? "new"}:${config?.defaultIngestionProjectId ?? "none"}:${config?.ingestionMode ?? "USAGE"}`}
      projects={projects}
      gatewayBaseUrl={gatewayBaseUrl}
      initialProjectId={config?.defaultIngestionProjectId ?? null}
      initialIngestionMode={initialIngestionMode}
      availableIngestionModes={
        isLangfuseCloud ? CLOUD_INGESTION_MODES : SELF_HOSTED_INGESTION_MODES
      }
      isSaving={createProject.isPending || updateConfig.isPending}
      saveError={createProject.isError || updateConfig.isError}
      onSave={async ({ projectId, ingestionMode }) => {
        try {
          await saveGatewayConfig({ projectId, ingestionMode });
        } catch (error) {
          reportNonTrpcError(error, "ai-gateway-configuration");
        }
      }}
      onCreateProject={handleCreateProject}
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

function hasActiveIngestionProject(
  project: { orgId: string; deletedAt: Date | null } | null | undefined,
  organizationId: string,
) {
  return !!project && !project.deletedAt && project.orgId === organizationId;
}
