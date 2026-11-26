import { useHasEntitlement, usePlan } from "@/src/features/entitlements/hooks";
import { useQueryOrganization } from "@/src/features/organizations/hooks";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { api } from "@/src/utils/api";
import { isCloudPlan } from "@langfuse/shared";
import { useSession } from "next-auth/react";

/** The org's UI data exports setting, including a change still in flight. */
export function useUiExportsSetting(orgId: string) {
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
    session?.environment.uiExportsDisabledByInstance === true;

  const utils = api.useUtils();
  const mutation = api.uiExports.setDisabled.useMutation({
    onSuccess: async () => {
      await Promise.all([
        updateSession(),
        utils.traces.byIdWithObservationsAndScores.invalidate(),
        utils.events.byTraceId.invalidate(),
        utils.sessions.byIdWithScores.invalidate(),
        utils.sessions.byIdWithScoresFromEvents.invalidate(),
        utils.sessions.observationsForSessionFromEvents.invalidate(),
      ]);
    },
  });

  const savedDisabled = mutation.isPending
    ? mutation.variables.disabled
    : (organization?.uiExportsDisabled ?? false);
  // Re-enabling stays possible without the entitlement, so a downgrade never
  // locks an org into a restriction it can no longer change.
  const canDisable = hasEntitlement || savedDisabled;

  const description = (() => {
    if (disabledByInstance) {
      return "Your instance administrator has turned off UI data exports for all organizations.";
    }
    const baseDescription =
      "Members can export and download data from the UI (batch exports, trace and session JSON, prompts, skills, charts, and large fields). API, SDK, and scheduled blob storage exports are unaffected.";
    if (!canDisable) {
      return isCloudPlan(plan)
        ? `${baseDescription} Turning this off is available on the Team and Enterprise plans.`
        : `${baseDescription} Turning this off requires an Enterprise license.`;
    }
    return baseDescription;
  })();

  return {
    exportsAllowed: !disabledByInstance && !savedDisabled,
    locked:
      !hasAccess || disabledByInstance || !canDisable || mutation.isPending,
    description,
    setDisabled: async (disabled: boolean) => {
      capture("organization_settings:ui_exports_toggle", { disabled });
      await mutation.mutateAsync({ orgId, disabled });
    },
  };
}
