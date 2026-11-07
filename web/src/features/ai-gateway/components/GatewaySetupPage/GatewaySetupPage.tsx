import { useRouter } from "next/router";

import { Skeleton } from "@/src/components/ui/skeleton";
import { GatewayConfigLoadError } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewayConfigLoadError/GatewayConfigLoadError";
import { GatewayCredentialsOverview } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewayCredentialsOverview/GatewayCredentialsOverview";
import { useGatewayConfig } from "@/src/features/ai-gateway/components/GatewaySetupPage/hooks/useGatewayConfig";
import type { GatewayProject } from "@/src/features/ai-gateway/components/GatewaySetupPage/types/gatewaySetup";

export type GatewaySetupPageProps = {
  organizationId: string;
  projects: Array<GatewayProject & { deletedAt?: Date | string | null }>;
};

/** The Providers page; the first-time setup guide lives on Overview. */
export function GatewaySetupPage({
  organizationId,
  projects,
}: GatewaySetupPageProps) {
  const router = useRouter();
  const connectionId =
    typeof router.query.connectionId === "string"
      ? router.query.connectionId
      : undefined;
  const gatewayConfig = useGatewayConfig(organizationId);

  if (gatewayConfig.status === "pending") {
    return <Skeleton className="h-64 w-full" />;
  }
  if (gatewayConfig.status === "error") {
    return <GatewayConfigLoadError onRetry={gatewayConfig.retry} />;
  }

  return (
    <GatewayCredentialsOverview
      organizationId={organizationId}
      connectionId={connectionId}
      config={gatewayConfig.config}
      projects={projects.filter((project) => !project.deletedAt)}
    />
  );
}
