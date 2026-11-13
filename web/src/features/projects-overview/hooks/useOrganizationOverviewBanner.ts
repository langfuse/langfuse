import { useSession } from "next-auth/react";
import { env } from "@/src/env.mjs";
import {
  useGatewayLaunchTarget,
  type GatewayLaunchTarget,
} from "@/src/features/ai-gateway/hooks/useGatewayLaunchEligibility";
import { getContextualFeatureFlags } from "@/src/features/feature-flags/utils";
import { hasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { useV4UpgradeUiEnabled } from "@/src/features/v4-migration/useV4UpgradeUiEnabled";

type OrganizationOverviewBanner =
  | { kind: "gateway"; target: GatewayLaunchTarget; userId: string }
  | { kind: "agent-tools" }
  | { kind: "none" };

/** The organization's gateway launch, or its agent-tools callout when the upgrade UI is off. */
export function useOrganizationOverviewBanner(
  organizationId: string | null,
): OrganizationOverviewBanner {
  const { data: session } = useSession();
  const organization = session?.user?.organizations.find(
    (org) => org.id === organizationId,
  );
  const v4UpgradeUiEnabled = useV4UpgradeUiEnabled();
  const gatewayLaunchCandidates =
    organization &&
    organization.id !== env.NEXT_PUBLIC_DEMO_ORG_ID &&
    getContextualFeatureFlags(session?.user, {
      organizationId: organization.id,
    })?.aiGateway === true &&
    hasOrganizationAccess({
      session,
      organizationId: organization.id,
      scope: "gateway:invoke",
    })
      ? [
          {
            organizationId: organization.id,
            organizationName: organization.name,
            canManage: hasOrganizationAccess({
              session,
              organizationId: organization.id,
              scope: "gateway:manage",
            }),
          },
        ]
      : [];
  const gatewayLaunchTarget = useGatewayLaunchTarget(gatewayLaunchCandidates);
  const userId = session?.user?.id;

  if (!organization) return { kind: "none" };
  if (gatewayLaunchTarget && userId) {
    return { kind: "gateway", target: gatewayLaunchTarget, userId };
  }
  if (v4UpgradeUiEnabled) return { kind: "none" };
  return { kind: "agent-tools" };
}
