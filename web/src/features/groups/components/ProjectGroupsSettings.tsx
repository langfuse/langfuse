import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { projectRoleAccessRights, type Role } from "@langfuse/shared";
import { Banner } from "@/src/components/design-system/Banner/Banner";
import { type TableProps } from "@/src/components/design-system/table/Table";
import Header from "@/src/components/layouts/header";
import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useQueryProject } from "@/src/features/projects/hooks";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import {
  describeGroupRoleCell,
  GroupRoleDialogController,
} from "@/src/features/groups/components/GroupRoleDialogController";
import { groupTableColumns } from "@/src/features/groups/components/groupTableColumns";
import { GROUP_SOURCE_DISPLAY } from "@/src/features/groups/groupSource";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { RoleCellTrigger } from "@/src/features/rbac/components/RoleCellTrigger";
import { roleName } from "@/src/features/rbac/components/roleDisplay";
import {
  hasProjectAccess,
  useHasProjectAccess,
} from "@/src/features/rbac/utils/checkProjectAccess";
import { api, type RouterOutputs } from "@/src/utils/api";

type ProjectGroup = RouterOutputs["groups"]["projectList"][number];
type GroupRole = "ADMIN" | "MEMBER" | "VIEWER";

const GROUP_ROLES: GroupRole[] = ["VIEWER", "MEMBER", "ADMIN"];

type ProjectGroupRow = {
  group: ProjectGroup;
  displayName: string;
  source: string;
  memberCount: number;
};

type ColumnContext = {
  editBlockedReason?: string;
  pendingGroupId: string | null;
  projectRoles: (current: string | null) => Role[];
  onChange: (group: ProjectGroup, role: GroupRole | null) => void;
};

function projectGroupColumns({
  editBlockedReason,
  pendingGroupId,
  projectRoles,
  onChange,
}: ColumnContext): LangfuseColumnDef<ProjectGroupRow>[] {
  const shared = groupTableColumns<ProjectGroupRow>();
  return [
    shared.name,
    shared.source,
    shared.members,
    {
      accessorKey: "projectRole",
      header: "Project role",
      headerTooltip: {
        description:
          "What every member of the group gets on this project: the group's organization role, or a higher project role set here. Click it to change the project role.",
        href: "https://langfuse.com/docs/administration/rbac",
      },
      size: 300,
      cell: ({ row }) => {
        const { group } = row.original;
        return (
          <GroupRoleDialogController
            level="project"
            groupName={group.displayName}
            memberCount={group.memberCount}
            orgRole={group.orgRole}
            projectRole={group.projectRole}
            grantableRoles={projectRoles(group.projectRole)}
            disabledReason={
              pendingGroupId === group.id ? "Saving…" : editBlockedReason
            }
            onChange={(role) => {
              // Project group roles never include AI Gateway.
              if (role === "AI_GATEWAY") return;
              onChange(group, role);
            }}
          >
            {(openDialog) => (
              <RoleCellTrigger
                {...describeGroupRoleCell({
                  level: "project",
                  groupName: group.displayName,
                  orgRole: group.orgRole,
                  projectRole: group.projectRole,
                })}
                onClick={openDialog}
              />
            )}
          </GroupRoleDialogController>
        );
      },
    },
  ];
}

function projectRolesBlockedReason({
  hasProjectRoles,
  canEditProjectMembers,
}: {
  hasProjectRoles: boolean;
  canEditProjectMembers: boolean;
}) {
  if (!hasProjectRoles) return "Project roles are not available on your plan.";
  if (!canEditProjectMembers)
    return "You do not have permission to change roles on this project.";
  return undefined;
}

export function ProjectGroupsSettings({ projectId }: { projectId: string }) {
  const session = useSession();
  const hasAdminApi = useHasEntitlement("admin-api");
  const hasProjectRoles = useHasEntitlement("rbac-project-roles");
  const { organization } = useQueryProject();
  const canManageOrgGroups = useHasOrganizationAccess({
    organizationId: organization?.id,
    scope: "organizationMembers:CUD",
  });
  const canRead = useHasProjectAccess({
    projectId,
    scope: "projectMembers:read",
  });
  const canEditProjectMembers = useHasProjectAccess({
    projectId,
    scope: "projectMembers:CUD",
  });
  const editBlockedReason = projectRolesBlockedReason({
    hasProjectRoles,
    canEditProjectMembers,
  });
  const utils = api.useUtils();
  const [search, setSearch] = useState("");

  const groups = api.groups.projectList.useQuery(
    { projectId },
    { enabled: hasAdminApi && canRead },
  );
  const setRole = api.groups.setProjectRole.useMutation({
    onSuccess: (_, input) => {
      utils.groups.invalidate().catch(() => undefined);
      utils.members.invalidate().catch(() => undefined);
      const name =
        groups.data?.find((group) => group.id === input.groupId)?.displayName ??
        "Group";
      showSuccessToast({
        operation: "group_project_role.update",
        title: "Group role saved",
        description: input.role
          ? `${name} is now ${roleName(input.role)} on this project`
          : `${name} no longer has a role on this project`,
        duration: 2000,
      });
    },
  });
  const pendingGroupId = setRole.isPending
    ? (setRole.variables?.groupId ?? null)
    : null;

  const columns = projectGroupColumns({
    editBlockedReason,
    pendingGroupId,
    // A role can be granted or taken away only if you hold all of its permissions.
    projectRoles: (current) => [
      "NONE",
      ...GROUP_ROLES.filter(
        (role) =>
          role === current ||
          projectRoleAccessRights[role].every((scope) =>
            hasProjectAccess({ session: session.data, projectId, scope }),
          ),
      ),
    ],
    onChange: (group, role) =>
      setRole.mutate({ projectId, groupId: group.id, role }),
  });

  const data = useMemo<TableProps<ProjectGroupRow>["data"]>(() => {
    if (groups.isPending) return { status: "loading" };
    if (groups.error) return { status: "error", error: groups.error.message };
    const query = search.trim().toLowerCase();
    return {
      status: "success",
      data: groups.data
        .filter(
          (group) => !query || group.displayName.toLowerCase().includes(query),
        )
        .map((group) => ({
          group,
          displayName: group.displayName,
          source: GROUP_SOURCE_DISPLAY[group.source].label,
          memberCount: group.memberCount,
        })),
    };
  }, [groups.isPending, groups.error, groups.data, search]);

  const header = (
    <Header
      title="Project groups"
      help={{
        description:
          "Give your organization's groups a role on this project. Members keep their own role and gain the group role's permissions on top. Groups and their members are managed in the organization settings.",
      }}
    />
  );

  if (!hasAdminApi) {
    return (
      <div>
        {header}
        <Banner title="Not available">
          SCIM provisioning is not available on your plan.
        </Banner>
      </div>
    );
  }
  if (!canRead) {
    return (
      <div>
        {header}
        <Banner title="Access denied">
          You do not have permission to view the members of this project.
        </Banner>
      </div>
    );
  }

  return (
    <div>
      {header}
      {!hasProjectRoles && (
        <div className="mb-4">
          <Banner title="Project roles are not available on your plan">
            Groups can still get access through their organization role.
          </Banner>
        </div>
      )}
      {setRole.error && (
        <div className="mb-4">
          <Banner variant="error" title="Could not save the group role">
            {setRole.error.message}
          </Banner>
        </div>
      )}
      <SettingsTable
        tableName="project groups"
        columns={columns}
        data={data}
        getRowLabel={(row) => row.displayName}
        columnVisibilityKey="groupsColumnVisibilityProject"
        columnOrderKey="groupsColumnOrderProject"
        noResultsMessage="This organization has no groups yet."
        search={{
          value: search,
          placeholder: "Search name",
          onChange: setSearch,
        }}
        toolbarActions={
          canManageOrgGroups && organization
            ? [
                {
                  id: "org-groups",
                  label: "Organization groups",
                  variant: "outline" as const,
                  href: `/organization/${organization.id}/settings/groups`,
                },
              ]
            : undefined
        }
      />
    </div>
  );
}
