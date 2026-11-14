import { useRouter } from "next/router";

import { useGatewaySettingsAccess } from "@/src/features/ai-gateway/hooks/useGatewaySettingsAccess";
import { type SessionOrganization } from "@/src/features/rbac/new/sessionAccessors";
import { api } from "@/src/utils/api";

/**
 * The gateway's ingestion project for the sidebar link on organization pages, or
 * null. Only gateway managers can read the config, and the project must be
 * one the user can open.
 */
export function useGatewayIngestionNavProjectId(
  organization: SessionOrganization | null | undefined,
) {
  const router = useRouter();
  const access = useGatewaySettingsAccess(organization?.id);
  const isEnabled =
    organization !== null &&
    organization !== undefined &&
    typeof router.query.organizationId === "string" &&
    access.showManagement &&
    access.isIngestionConfigured === true;
  const configQuery = api.aiGateway.getConfig.useQuery(
    { orgId: organization?.id ?? "" },
    { enabled: isEnabled },
  );

  const projectId = configQuery.data?.config?.defaultIngestionProjectId;
  if (!isEnabled || !organization || !projectId) return null;
  const canOpenProject = organization.projects.some(
    (project) => project.id === projectId && !project.deletedAt,
  );
  return canOpenProject ? projectId : null;
}
