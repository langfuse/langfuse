/* eslint-disable @repo/no-abstracted-overlay-trigger */
import { api } from "@/src/utils/api";
import { useState } from "react";
import { PlusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  useHasEntitlement,
  useEntitlementLimit,
} from "@/src/features/entitlements/hooks";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { ActionButton } from "@/src/components/ActionButton";
import { CreateProjectMemberDialogContent } from "@/src/features/rbac/components/CreateProjectMemberDialogContent";

export function CreateProjectMemberButton(props: {
  orgId: string;
  project?: { id: string; name: string };
}) {
  const [open, setOpen] = useState(false);
  const hasOrgAccess = useHasOrganizationAccess({
    organizationId: props.orgId,
    scope: "organizationMembers:CUD",
  });
  const hasProjectAccess = useHasProjectAccess({
    projectId: props.project?.id,
    scope: "projectMembers:CUD",
  });
  const orgMemberLimit = useEntitlementLimit("organization-member-count");
  const orgMemberCount = api.members.allFromOrg.useQuery(
    {
      orgId: props.orgId,
      page: 0,
      limit: 1,
    },
    {
      enabled: hasOrgAccess,
    },
  ).data?.totalCount;
  const inviteCount = api.members.allInvitesFromOrg.useQuery(
    {
      orgId: props.orgId,
      page: 0,
      limit: 1,
    },
    {
      enabled: hasOrgAccess,
    },
  ).data?.totalCount;
  const hasProjectRoleEntitlement = useHasEntitlement("rbac-project-roles");
  const hasOnlySingleProjectAccess =
    !hasOrgAccess && hasProjectAccess && hasProjectRoleEntitlement;

  const utils = api.useUtils();
  const mutCreateProjectMember = api.members.create.useMutation({
    onSuccess: () => utils.members.invalidate(),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <ActionButton
            variant="secondary"
            loading={mutCreateProjectMember.isPending}
            hasAccess={hasOrgAccess || hasOnlySingleProjectAccess}
            usageLimit={
              typeof orgMemberLimit === "number"
                ? {
                    current: (orgMemberCount ?? 0) + (inviteCount ?? 0),
                    max: orgMemberLimit,
                  }
                : undefined
            }
            icon={<PlusIcon className="h-5 w-5" aria-hidden="true" />}
          >
            {hasOnlySingleProjectAccess
              ? "Add project member"
              : "Add new member"}
          </ActionButton>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Add new member to the{" "}
              {hasOnlySingleProjectAccess ? "project" : "organization"}
            </DialogTitle>
          </DialogHeader>
          <CreateProjectMemberDialogContent
            project={props.project}
            hasOnlySingleProjectAccess={hasOnlySingleProjectAccess}
            hasProjectRoleEntitlement={hasProjectRoleEntitlement}
            isSubmitting={mutCreateProjectMember.isPending}
            createProjectMember={(values) =>
              mutCreateProjectMember
                .mutateAsync({
                  orgId: props.orgId,
                  email: values.email,
                  orgRole: values.orgRole,
                  projectId: props.project?.id,
                  projectRole:
                    values.projectRole === "none"
                      ? undefined
                      : values.projectRole,
                })
                .then(() => undefined)
            }
            onSuccess={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
