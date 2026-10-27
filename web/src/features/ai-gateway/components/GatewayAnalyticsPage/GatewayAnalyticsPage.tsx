/* eslint-disable @typescript-eslint/no-use-before-define */
import { ChartColumn } from "@langfuse/icons";

import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewayAnalyticsDashboard } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsDashboard/GatewayAnalyticsDashboard";
import { GatewaySetupEmptyState } from "@/src/features/ai-gateway/components/GatewaySetupEmptyState/GatewaySetupEmptyState";
import { useGatewayConfig } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useGatewayConfig";
import { useLangfuseV4WriteMode } from "@/src/features/organizations/hooks";

/** Managers only; the settings route sends them to Setup until ingestion is configured. */
export function GatewayAnalyticsPage({
  organizationId,
}: {
  organizationId: string;
}) {
  const configState = useGatewayConfig(organizationId);
  const v4WriteMode = useLangfuseV4WriteMode();

  // Widgets run v2 queries, which legacy write mode does not serve.
  if (v4WriteMode === "legacy") {
    return <AnalyticsNeedEvents />;
  }
  if (configState.status === "pending") {
    return <AnalyticsSkeleton />;
  }
  if (configState.status === "error") {
    return <AnalyticsLoadError retry={configState.retry} />;
  }

  const project = configState.config?.defaultIngestionProject;
  if (
    configState.config?.ingestionMode === "NONE" ||
    !project ||
    project.deletedAt
  ) {
    return <AnalyticsUnavailable organizationId={organizationId} />;
  }
  return (
    <GatewayAnalyticsDashboard
      organizationId={organizationId}
      projectId={project.id}
    />
  );
}

function AnalyticsUnavailable({ organizationId }: { organizationId: string }) {
  return (
    <div className="flex flex-col gap-4">
      <Header title="Gateway analytics" />
      <GatewaySetupEmptyState
        icon={ChartColumn}
        title="Gateway requests are not recorded"
        description="Analytics are built from the traces the gateway writes to its ingestion project. Turn on usage or full ingestion in Setup to see cost and usage here."
        actions={[
          {
            type: "link",
            label: "Open Setup",
            href: `/organization/${organizationId}/settings/ai-gateway`,
          },
        ]}
      />
    </div>
  );
}

function AnalyticsNeedEvents() {
  return (
    <div className="flex flex-col gap-4">
      <Header title="Gateway analytics" />
      <GatewaySetupEmptyState
        icon={ChartColumn}
        title="Analytics are not available on this deployment"
        description="Gateway analytics read from the events tables, which are not written while LANGFUSE_MIGRATION_V4_WRITE_MODE is legacy."
      />
    </div>
  );
}

function AnalyticsLoadError({ retry }: { retry: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Header title="Gateway analytics" />
      <Alert variant="destructive">
        <Alert.Title>Gateway configuration could not be loaded</Alert.Title>
        <Alert.Description>
          Analytics need the gateway&apos;s ingestion project.
        </Alert.Description>
      </Alert>
      <div>
        <Button text="Retry" variant="secondary" onClick={retry} />
      </div>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div
      className="flex flex-col gap-4"
      data-testid="gateway-analytics-loading"
    >
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
