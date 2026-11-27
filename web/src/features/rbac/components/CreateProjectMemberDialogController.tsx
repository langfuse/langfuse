import { entitlementAccess, planLabels, type Role } from "@langfuse/shared";
import { type ReactNode, useState } from "react";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { describeInvitesSent } from "@/src/features/rbac/fns/describeInvitesSent";
import { stripeProducts } from "@/src/ee/features/billing/utils/stripeCatalogue";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { CreateProjectMemberDialog } from "@/src/features/rbac/components/CreateProjectMemberDialog";
import {
  useEntitlementLimit,
  useHasEntitlement,
  usePlan,
} from "@/src/features/entitlements/hooks";
import { default as useIsFeatureEnabled } from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { useOrganization } from "@/src/features/organizations/hooks";
import { useQueryProjectOrOrganization } from "@/src/features/projects/hooks";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { getSeatState } from "@/src/features/rbac/fns/getSeatState";
import type { MemberInviteSurface } from "@/src/features/rbac/types/memberInviteAnalytics";
import { api } from "@/src/utils/api";

/** The cheapest plan without a member limit, which the seat line offers. */
const unlimitedMembersPlan = [...stripeProducts]
  .sort((a, b) => (a.orderKey ?? 0) - (b.orderKey ?? 0))
  .find(
    ({ mappedPlan }) =>
      entitlementAccess[mappedPlan].entitlementLimits[
        "organization-member-count"
      ] === false,
  )?.mappedPlan;

type CreateProjectMemberDialogControllerProps = {
  /** The organization and project to invite to; the page's own when left out. */
  target?: {
    orgId: string;
    project: { id: string; name: string } | undefined;
  };
  /** Where the dialog is placed, for the invite funnel's events. */
  surface: MemberInviteSurface;
  /** The organization role the dialog opens with; Member unless named. */
  defaultOrgRole?: Role;
  children: (control: {
    hasAccess: boolean;
    hasOnlySingleProjectAccess: boolean;
    isSubmitting: boolean;
    openDialog: () => void;
  }) => ReactNode;
};

/**
 * The whole invite flow behind any trigger: access, seats, the request and
 * its events. The caller renders the trigger and calls `openDialog`.
 */
export function CreateProjectMemberDialogController({
  target,
  surface,
  defaultOrgRole,
  children,
}: CreateProjectMemberDialogControllerProps) {
  const route = useQueryProjectOrOrganization();
  const orgId = target ? target.orgId : (route.organization?.id ?? "");
  const project = target ? target.project : (route.project ?? undefined);
  const hasOrgAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organizationMembers:CUD",
  });
  const hasProjectAccess = useHasProjectAccess({
    projectId: project?.id,
    scope: "projectMembers:CUD",
  });
  const canManageOrgOwnership = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organization:manageOwnership",
  });
  const canManageProjectOwnership = canManageOrgOwnership;
  const hasProjectRoleEntitlement = useHasEntitlement("rbac-project-roles");
  const isAiGatewayEnabled = useIsFeatureEnabled("aiGateway", {
    organizationId: orgId,
  });
  const hasOnlySingleProjectAccess =
    !hasOrgAccess && hasProjectAccess && hasProjectRoleEntitlement;
  const hasAccess = hasOrgAccess || hasOnlySingleProjectAccess;
  const canManageBilling = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "langfuseCloudBilling:CRUD",
  });
  const organizationName = useOrganization(orgId || null)?.name ?? "";
  const plan = usePlan();

  const orgMemberLimit = useEntitlementLimit("organization-member-count");
  // Counted only while the dialog is open, so a trigger costs nothing until it is used;
  // refetched on focus, so a seat bought in the billing tab shows.
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const seatCountInput = { orgId, page: 0, limit: 1 };
  const seatCountOptions = {
    enabled: hasOrgAccess && isDialogOpen && typeof orgMemberLimit === "number",
    refetchOnWindowFocus: true,
  };
  const memberCountQuery = api.members.allFromOrg.useQuery(
    seatCountInput,
    seatCountOptions,
  );
  const inviteCountQuery = api.members.allInvitesFromOrg.useQuery(
    seatCountInput,
    seatCountOptions,
  );
  const orgMemberCount = memberCountQuery.data?.totalCount;
  const inviteCount = inviteCountQuery.data?.totalCount;

  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const createProjectMemberMutation = api.members.create.useMutation({
    onSuccess: () => utils.members.invalidate(),
    // The form owns error presentation; avoid a duplicate global toast.
    onError: () => undefined,
  });
  // Members and pending invitations both hold a seat, as the server counts them.
  const seatLimit =
    typeof orgMemberLimit === "number" &&
    plan !== undefined &&
    orgMemberCount !== undefined &&
    inviteCount !== undefined
      ? {
          used: orgMemberCount + inviteCount,
          max: orgMemberLimit,
          planName: planLabels[plan],
          upgradePlanName:
            unlimitedMembersPlan && planLabels[unlimitedMembersPlan],
          billingHref: canManageBilling
            ? `/organization/${orgId}/settings/billing`
            : undefined,
        }
      : undefined;

  // Waits for the seat counts, so a limited plan never reports "none".
  async function captureDialogOpen() {
    if (typeof orgMemberLimit !== "number") {
      capture("members:invite_dialog_open", {
        surface,
        hasUsageLimit: false,
        seatState: "none",
      });
      return;
    }
    const [members, invites] = await Promise.all([
      utils.members.allFromOrg.ensureData(seatCountInput),
      utils.members.allInvitesFromOrg.ensureData(seatCountInput),
    ]);
    capture("members:invite_dialog_open", {
      surface,
      hasUsageLimit: true,
      seatState: getSeatState(
        { used: members.totalCount + invites.totalCount, max: orgMemberLimit },
        0,
      ),
    });
  }

  return (
    <DialogController
      onDismiss={() => setIsDialogOpen(false)}
      renderDialog={({ closeDialog: closeControllerDialog }) => {
        const closeDialog = () => {
          closeControllerDialog();
          setIsDialogOpen(false);
        };
        return (
          <CreateProjectMemberDialog
            project={project}
            organizationName={organizationName}
            hasOnlySingleProjectAccess={hasOnlySingleProjectAccess}
            hasProjectRoleEntitlement={hasProjectRoleEntitlement}
            canManageOrgOwnership={canManageOrgOwnership}
            canManageProjectOwnership={canManageProjectOwnership}
            isAiGatewayEnabled={isAiGatewayEnabled}
            defaultOrgRole={defaultOrgRole}
            isPending={createProjectMemberMutation.isPending}
            seatLimit={seatLimit}
            // A count that failed stops holding the send: the server still enforces the limit.
            isCountingSeats={
              memberCountQuery.isLoading || inviteCountQuery.isLoading
            }
            inviteMembers={(values) => {
              capture(
                project
                  ? "project_settings:send_membership_invitation"
                  : "organization_settings:send_membership_invitation",
                {
                  orgRole: values.orgRole,
                  projectRole: values.projectRole,
                  emailCount: values.emails.length,
                  surface,
                  seatState: getSeatState(seatLimit, values.emails.length),
                },
              );

              return createProjectMemberMutation.mutateAsync({
                orgId,
                emails: values.emails,
                orgRole: values.orgRole,
                projectId: project?.id,
                projectRole:
                  values.projectRole === "NONE"
                    ? undefined
                    : values.projectRole,
              });
            }}
            onAllInvited={(result) => {
              showSuccessToast({
                operation: "members.create",
                ...describeInvitesSent(result),
              });
              closeDialog();
            }}
            onDone={closeDialog}
            onBeforeOpenBilling={(chipCount) =>
              capture("members:invite_upgrade_click", {
                surface,
                seatState: getSeatState(seatLimit, chipCount),
                emailCount: chipCount,
                isOwner: canManageBilling,
              })
            }
          />
        );
      }}
    >
      {({ openDialog }) =>
        children({
          hasAccess,
          hasOnlySingleProjectAccess,
          isSubmitting: createProjectMemberMutation.isPending,
          openDialog: () => {
            setIsDialogOpen(true);
            openDialog();
            // A failed count is already reported by the query cache.
            captureDialogOpen().catch(() => undefined);
          },
        })
      }
    </DialogController>
  );
}
