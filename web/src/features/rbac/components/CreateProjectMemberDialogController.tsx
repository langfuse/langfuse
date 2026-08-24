import { type ReactNode } from "react";
import { Role } from "@langfuse/shared";

import {
  DialogController,
  DialogHeader,
  DialogTitle,
  type DialogTrigger,
} from "@/src/components/ui/dialog";
import { CreateProjectMemberDialogContent } from "@/src/features/rbac/components/CreateProjectMemberDialogContent";
import {
  useEntitlementLimit,
  useHasEntitlement,
} from "@/src/features/entitlements/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";

type CreateProjectMemberDialogControllerProps = {
  orgId: string;
  project: { id: string; name: string } | undefined;
  children: (control: {
    hasAccess: boolean;
    hasOnlySingleProjectAccess: boolean;
    isSubmitting: boolean;
    usageLimit:
      | {
          current: number | undefined;
          max: number;
        }
      | undefined;
    Trigger: typeof DialogTrigger;
  }) => ReactNode;
};

export function CreateProjectMemberDialogController({
  orgId,
  project,
  children,
}: CreateProjectMemberDialogControllerProps) {
  const hasOrgAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organizationMembers:CUD",
  });
  const hasProjectAccess = useHasProjectAccess({
    projectId: project?.id,
    scope: "projectMembers:CUD",
  });
  const hasProjectRoleEntitlement = useHasEntitlement("rbac-project-roles");
  const hasOnlySingleProjectAccess =
    !hasOrgAccess && hasProjectAccess && hasProjectRoleEntitlement;
  const hasAccess = hasOrgAccess || hasOnlySingleProjectAccess;

  const orgMemberLimit = useEntitlementLimit("organization-member-count");
  const orgMemberCount = api.members.allFromOrg.useQuery(
    {
      orgId,
      page: 0,
      limit: 1,
    },
    {
      enabled: hasOrgAccess,
    },
  ).data?.totalCount;
  const inviteCount = api.members.allInvitesFromOrg.useQuery(
    {
      orgId,
      page: 0,
      limit: 1,
    },
    {
      enabled: hasOrgAccess,
    },
  ).data?.totalCount;

  const utils = api.useUtils();
  const createProjectMemberMutation = api.members.create.useMutation({
    onSuccess: () => utils.members.invalidate(),
  });
  const usageLimit =
    typeof orgMemberLimit === "number"
      ? {
          current: (orgMemberCount ?? 0) + (inviteCount ?? 0),
          max: orgMemberLimit,
        }
      : undefined;

  return (
    <DialogController
      closeOnInteractionOutside={false}
      size="default"
      renderContent={({ closeDialog }) => (
        <>
          <DialogHeader>
            <DialogTitle>
              Add new member to{" "}
              {hasOnlySingleProjectAccess ? "project" : "organization"}
            </DialogTitle>
          </DialogHeader>
          <CreateProjectMemberDialogContent
            project={project}
            hasOnlySingleProjectAccess={hasOnlySingleProjectAccess}
            hasProjectRoleEntitlement={hasProjectRoleEntitlement}
            isSubmitting={createProjectMemberMutation.isPending}
            createProjectMember={(values) =>
              createProjectMemberMutation
                .mutateAsync({
                  orgId,
                  email: values.email,
                  orgRole: values.orgRole,
                  projectId: project?.id,
                  projectRole:
                    values.projectRole === Role.NONE
                      ? undefined
                      : values.projectRole,
                })
                .then(() => undefined)
            }
            onSuccess={closeDialog}
          />
        </>
      )}
    >
      {({ Trigger }) =>
        children({
          hasAccess,
          hasOnlySingleProjectAccess,
          isSubmitting: createProjectMemberMutation.isPending,
          usageLimit,
          Trigger,
        })
      }
    </DialogController>
  );
}
