import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertCircle } from "@langfuse/icons";
import { projectRoleAccessRights, type Role } from "@langfuse/shared";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { type TableProps } from "@/src/components/design-system/table/Table";
import Header from "@/src/components/layouts/header";
import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { GroupMemberStack } from "@/src/features/groups/components/GroupMemberStack";
import { GroupName } from "@/src/features/groups/components/GroupName";
import {
  describeGroupRoleCell,
  GroupRoleDialogController,
} from "@/src/features/groups/components/GroupRoleDialogController";
import { RoleCellTrigger } from "@/src/features/rbac/components/RoleCellTrigger";
import { GroupSourceLabel } from "@/src/features/groups/components/GroupSourceLabel";
import { GROUP_SOURCE_DISPLAY } from "@/src/features/groups/groupSource";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import {
  hasProjectAccess,
  useHasProjectAccess,
} from "@/src/features/rbac/utils/checkProjectAccess";
import { api, type RouterOutputs } from "@/src/utils/api";

type ProjectGroup = RouterOutputs["groups"]["projectList"][number];
type GroupRole = "ADMIN" | "MEMBER" | "VIEWER";

const GROUP_ROLES: GroupRole[] = ["VIEWER", "MEMBER", "ADMIN"];
const roleLabel = (role: string) =>
  role.charAt(0) + role.slice(1).toLowerCase();

type ProjectGroupRow = {
  group: ProjectGroup;
  displayName: string;
  source: string;
  memberCount: number;
};

type ColumnContext = {
  /** Why project roles cannot be changed here, if they cannot. */
  editBlockedReason?: string;
  pendingGroupId: string | null;
  /** Roles you cannot grant are left out, as on the Members page. */
  projectRoles: (current: string | null) => Role[];
  onChange: (group: ProjectGroup, role: GroupRole | null) => void;
};

function projectGroupColumns({
  editBlockedReason,
  pendingGroupId,
  projectRoles,
  onChange,
}: ColumnContext): LangfuseColumnDef<ProjectGroupRow>[] {
  return [
    {
      accessorKey: "displayName",
      header: "Name",
      cell: ({ row }) => <GroupName group={row.original.group} />,
    },
    {
      accessorKey: "source",
      header: "Source",
      enableHiding: true,
      headerTooltip: {
        description:
          "SCIM: synced from your identity provider, so its name and members are managed there. Langfuse: created here by an admin.",
      },
      size: 120,
      cell: ({ row }) => (
        <GroupSourceLabel source={row.original.group.source} />
      ),
    },
    {
      accessorKey: "memberCount",
      header: "Members",
      size: 180,
      cell: ({ row }) => (
        <GroupMemberStack members={row.original.group.members} />
      ),
    },
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

/** Why group project roles cannot be changed here, if they cannot. */
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

// Project admins give the org's groups a role on this project, like project
// roles of members. Groups, their members and org-wide roles are managed in
// the organization settings.
export function ProjectGroupsSettings({ projectId }: { projectId: string }) {
  const session = useSession();
  const hasAdminApi = useHasEntitlement("admin-api");
  const hasProjectRoles = useHasEntitlement("rbac-project-roles");
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
          ? `${name} is now ${roleLabel(input.role)} on this project`
          : `${name} no longer has a role on this project`,
        duration: 2000,
      });
    },
  });
  const pendingGroupId = setRole.isPending
    ? (setRole.variables?.groupId ?? null)
    : null;

  const columns = useMemo(
    () =>
      projectGroupColumns({
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
      }),
    [editBlockedReason, pendingGroupId, session.data, projectId, setRole],
  );

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
        <Alert icon={AlertCircle}>
          <Alert.Title>Not available</Alert.Title>
          <Alert.Description>
            SCIM provisioning is not available on your plan.
          </Alert.Description>
        </Alert>
      </div>
    );
  }
  if (!canRead) {
    return (
      <div>
        {header}
        <Alert>
          <Alert.Title>Access Denied</Alert.Title>
          <Alert.Description>
            You do not have permission to view the members of this project.
          </Alert.Description>
        </Alert>
      </div>
    );
  }

  return (
    <div>
      {header}
      {!hasProjectRoles && (
        <div className="mb-4">
          <Alert icon={AlertCircle}>
            <Alert.Title>
              Project roles are not available on your plan
            </Alert.Title>
            <Alert.Description>
              Groups can still get access through their organization role.
            </Alert.Description>
          </Alert>
        </div>
      )}
      {setRole.error && (
        <div className="mb-4">
          <Alert icon={AlertCircle}>
            <Alert.Title>Could not save the group role</Alert.Title>
            <Alert.Description>{setRole.error.message}</Alert.Description>
          </Alert>
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
      />
    </div>
  );
}
