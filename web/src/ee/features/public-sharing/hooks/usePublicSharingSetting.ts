import { useHasEntitlement, usePlan } from "@/src/features/entitlements/hooks";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { api } from "@/src/utils/api";
import { isCloudPlan } from "@langfuse/shared";
import { useSession } from "next-auth/react";

/** The org's public sharing setting, including a change still in flight. */
export function usePublicSharingSetting(orgId: string) {
  const { data: session, update: updateSession } = useSession();
  const organization = useQueryOrganization();
  const plan = usePlan();
  const capture = usePostHogClientCapture();
  const hasAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organization:update",
  });
  const hasEntitlement = useHasEntitlement("public-sharing-controls");
  const disabledByInstance =
    session?.environment.publicSharingDisabledByInstance === true;

  const mutation = api.publicSharing.setDisabled.useMutation({
    onSuccess: async () => {
      await updateSession();
    },
  });

  const savedDisabled = mutation.isPending
    ? mutation.variables.disabled
    : (organization?.publicSharingDisabled ?? false);
  // Re-enabling stays possible without the entitlement, so a downgrade never
  // locks an org into a restriction it can no longer change.
  const canDisable = hasEntitlement || savedDisabled;

  const description = (() => {
    if (disabledByInstance) {
      return "Your instance administrator has turned off public sharing for all organizations.";
    }
    if (!canDisable) {
      return isCloudPlan(plan)
        ? "Members can share traces and sessions with anyone who has the link. Turning this off is available on the Team and Enterprise plans."
        : "Members can share traces and sessions with anyone who has the link. Turning this off requires an Enterprise license.";
    }
    return "Members can share traces and sessions with anyone who has the link. Turning this off also stops all existing share links from working.";
  })();

  return {
    sharingAllowed: !disabledByInstance && !savedDisabled,
    locked:
      !hasAccess || disabledByInstance || !canDisable || mutation.isPending,
    description,
    setDisabled: async (disabled: boolean) => {
      capture("organization_settings:public_sharing_toggle", { disabled });
      await mutation.mutateAsync({ orgId, disabled });
    },
  };
}
