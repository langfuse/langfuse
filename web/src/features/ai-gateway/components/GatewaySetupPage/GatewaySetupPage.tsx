import { useRouter } from "next/router";

import { GatewayConfigLoader } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewayConfigLoader";
import { GatewayCredentialsOverview } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewayCredentialsOverview/GatewayCredentialsOverview";
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

  return (
    <GatewayConfigLoader organizationId={organizationId}>
      {(config) => (
        <GatewayCredentialsOverview
          organizationId={organizationId}
          connectionId={connectionId}
          config={config}
          projects={projects.filter((project) => !project.deletedAt)}
        />
      )}
    </GatewayConfigLoader>
  );
}
