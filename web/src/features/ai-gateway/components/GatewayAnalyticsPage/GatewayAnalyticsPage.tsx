/* eslint-disable @typescript-eslint/no-use-before-define */
import { ChartColumn } from "@langfuse/icons";

import Header from "@/src/components/layouts/header";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewayAnalyticsDashboard } from "@/src/features/ai-gateway/components/GatewayAnalyticsPage/components/GatewayAnalyticsDashboard/GatewayAnalyticsDashboard";
import { GatewaySetupEmptyState } from "@/src/features/ai-gateway/components/GatewaySetupEmptyState/GatewaySetupEmptyState";
import { useGatewayConfig } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useGatewayConfig";

/** Managers only; the settings route sends them to Setup until ingestion is configured. */
export function GatewayAnalyticsPage({
  organizationId,
}: {
  organizationId: string;
}) {
  const configState = useGatewayConfig(organizationId);

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
      <Button className="w-fit" variant="secondary" onClick={retry}>
        Retry
      </Button>
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
