import { useEffect, useMemo, useState } from "react";
import { PlusIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { StringParam, useQueryParam, withDefault } from "use-query-params";

import { Alert } from "@/src/components/design-system/Alert/Alert";
import { type AsyncTableData } from "@/src/components/design-system/table/Table";
import useSessionStorage from "@/src/components/useSessionStorage";
import { env } from "@/src/env.mjs";
import { useHasEntitlement } from "@/src/features/entitlements";
import { showSuccessToast } from "@/src/features/notifications";
import { CreateProjectMemberDialogController } from "@/src/features/rbac/components/CreateProjectMemberDialogController";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import type { RouterOutput } from "@/src/utils/types";
import {
  MembersSettingsTable,
  type MembersSettingsTableRow,
} from "./MembersSettingsTable";

export function ConnectedMembersSettingsTable({
  orgId,
  project,
}: {
  orgId: string;
  project?: { id: string; name: string };
}) {
  const session = useSession();

  const utils = api.useUtils();

  const hasOrgViewAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organizationMembers:read",
  });

  const hasProjectViewAccess =
    useHasProjectAccess({
      projectId: project?.id,
      scope: "projectMembers:read",
    }) || hasOrgViewAccess;

  const hasOrgCudAccess = useHasOrganizationAccess({
    organizationId: orgId,
    scope: "organizationMembers:CUD",
  });

  const hasProjectCudAccess = useHasProjectAccess({
    projectId: project?.id,
    scope: "projectMembers:CUD",
  });

  const projectRolesEntitlement = useHasEntitlement("rbac-project-roles");
  const [updatingOrgRoleMembershipIds, setUpdatingOrgRoleMembershipIds] =
    useState<Set<string>>(() => new Set());
  const [
    updatingProjectRoleMembershipIds,
    setUpdatingProjectRoleMembershipIds,
  ] = useState<Set<string>>(() => new Set());

  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );

  const [paginationState, setPaginationState] = useSessionStorage(
    project
      ? `projectMembers_${project.id}_pagination`
      : `orgMembers_${orgId}_pagination`,
    { pageIndex: 0, pageSize: 10 },
  );

  useEffect(() => {
    setPaginationState((previous) => ({
      pageIndex: 0,
      pageSize: previous.pageSize,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const membersViaOrg = api.members.allFromOrg.useQuery(
    {
      orgId,
      searchQuery: searchQuery ?? undefined,
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
    },
    { enabled: !project && hasOrgViewAccess },
  );

  const membersViaProject = api.members.allFromProject.useQuery(
    {
      projectId: project?.id ?? "NOT ENABLED",
      searchQuery: searchQuery ?? undefined,
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
    },
    { enabled: Boolean(project) && hasProjectViewAccess },
  );
  const members = project ? membersViaProject : membersViaOrg;

  const deleteMember = api.members.deleteMembership.useMutation({
    onSuccess: (data) => {
      if (data.userId === session.data?.user?.id) session.update();
      utils.members.invalidate();
    },
  });

  const updateOrgRole = api.members.updateOrgMembership.useMutation({
    onSuccess: (data) => {
      utils.members.invalidate();
      if (data.userId === session.data?.user?.id) session.update();
      showSuccessToast({
        title: "Saved",
        description: "Organization role updated successfully",
        duration: 2000,
      });
    },
  });

  const updateProjectRole = api.members.updateProjectRole.useMutation({
    onSuccess: (data) => {
      utils.members.invalidate();
      if (data.userId === session.data?.user?.id) session.update();
      showSuccessToast({
        title: "Saved",
        description: "Project role updated successfully",
        duration: 2000,
      });
    },
  });

  const tableData = useMemo<AsyncTableData<MembersSettingsTableRow[]>>(() => {
    if (members.isPending) return { status: "loading" };
    if (members.isError)
      return { status: "error", error: members.error.message };

    if (project) {
      return {
        status: "success",
        data: safeExtract(membersViaProject.data, "memberships", []).map(
          (membership) => convertToTableRow(membership, null, null),
        ),
      };
    }

    return {
      status: "success",
      data: safeExtract(membersViaOrg.data, "memberships", []).map(
        (membership) =>
          convertToTableRow(
            membership,
            membership.featurePreviews,
            membership.featurePreviewManagement,
          ),
      ),
    };
  }, [
    members.error,
    members.isError,
    members.isPending,
    membersViaOrg.data,
    membersViaProject.data,
    project,
  ]);

  if (project ? !hasProjectViewAccess : !hasOrgViewAccess) {
    return (
      <Alert>
        <Alert.Title>Access Denied</Alert.Title>
        <Alert.Description>
          You do not have permission to view members of this organization.
        </Alert.Description>
      </Alert>
    );
  }

  return (
    <CreateProjectMemberDialogController orgId={orgId} project={project}>
      {({
        hasAccess,
        hasOnlySingleProjectAccess,
        isSubmitting,
        usageLimit,
        openDialog,
      }) => (
        <MembersSettingsTable
          orgId={orgId}
          project={project}
          currentUserId={session.data?.user?.id}
          hasOrgCudAccess={hasOrgCudAccess}
          hasProjectCudAccess={hasProjectCudAccess}
          projectRolesEntitlement={projectRolesEntitlement}
          showFeaturePreviews={
            !project && hasOrgCudAccess && orgId !== env.NEXT_PUBLIC_DEMO_ORG_ID
          }
          updatingOrgRoleMembershipIds={updatingOrgRoleMembershipIds}
          updatingProjectRoleMembershipIds={updatingProjectRoleMembershipIds}
          onDelete={(member) => {
            const isCurrentUser = member.meta.userId === session.data?.user?.id;
            if (
              !confirm(
                isCurrentUser
                  ? "Are you sure you want to leave the organization?"
                  : "Are you sure you want to remove this member from the organization?",
              )
            ) {
              return;
            }
            deleteMember.mutate({
              orgId,
              orgMembershipId: member.meta.orgMembershipId,
            });
          }}
          onUpdateOrgRole={(member, role) => {
            if (
              member.meta.userId === session.data?.user?.id &&
              !confirm(
                "Are you sure that you want to change your own organization role?",
              )
            ) {
              return;
            }
            const membershipId = member.meta.orgMembershipId;
            setUpdatingOrgRoleMembershipIds((current) =>
              new Set(current).add(membershipId),
            );
            updateOrgRole.mutate(
              { orgId, orgMembershipId: membershipId, role },
              {
                onSettled: () =>
                  setUpdatingOrgRoleMembershipIds((current) => {
                    const next = new Set(current);
                    next.delete(membershipId);
                    return next;
                  }),
              },
            );
          }}
          onUpdateProjectRole={(member, projectRole) => {
            if (!project) return;
            if (
              member.meta.userId === session.data?.user?.id &&
              !confirm(
                "Are you sure that you want to change your own project role?",
              )
            ) {
              return;
            }
            const membershipId = member.meta.orgMembershipId;
            setUpdatingProjectRoleMembershipIds((current) =>
              new Set(current).add(membershipId),
            );
            updateProjectRole.mutate(
              {
                orgId,
                orgMembershipId: membershipId,
                projectId: project.id,
                userId: member.meta.userId,
                projectRole,
              },
              {
                onSettled: () =>
                  setUpdatingProjectRoleMembershipIds((current) => {
                    const next = new Set(current);
                    next.delete(membershipId);
                    return next;
                  }),
              },
            );
          }}
          data={tableData}
          loadingRowCount={paginationState.pageSize}
          search={{
            value: searchQuery ?? "",
            onChange: (value) => setSearchQuery(value || null),
          }}
          toolbarActions={[
            {
              id: "add-member",
              label: hasOnlySingleProjectAccess
                ? "Add project member"
                : "Add new member",
              variant: "secondary",
              loading: isSubmitting,
              hasAccess,
              usageLimit,
              icon: <PlusIcon className="size-4" aria-hidden="true" />,
              onClick: openDialog,
            },
          ]}
          pagination={{
            totalCount: members.data?.totalCount ?? null,
            onChange: setPaginationState,
            state: paginationState,
          }}
        />
      )}
    </CreateProjectMemberDialogController>
  );
}

function convertToTableRow(
  membership:
    | RouterOutput["members"]["allFromOrg"]["memberships"][number]
    | RouterOutput["members"]["allFromProject"]["memberships"][number],
  featurePreviews: MembersSettingsTableRow["featurePreviews"],
  featurePreviewManagement: MembersSettingsTableRow["featurePreviewManagement"],
): MembersSettingsTableRow {
  return {
    meta: { userId: membership.userId, orgMembershipId: membership.id },
    email: membership.user.email,
    user: { image: membership.user.image, name: membership.user.name },
    providers:
      membership.user.accounts?.map(
        (account: { provider: string }) => account.provider,
      ) ?? [],
    createdAt: membership.createdAt,
    orgRole: membership.role,
    projectRole: membership.projectRole,
    featurePreviews,
    featurePreviewManagement,
  };
}
