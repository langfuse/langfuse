import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { AlertCircle } from "@langfuse/icons";
import { projectRoleAccessRights, type Role } from "@langfuse/shared";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { type TableProps } from "@/src/components/design-system/table/Table";
import { createBadgeTableColumn } from "@/src/components/design-system/table/columns/createBadgeTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import Header from "@/src/components/layouts/header";
import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { GROUP_SOURCE_DISPLAY } from "@/src/features/groups/groupSource";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { RoleSelect } from "@/src/features/rbac/components/RoleSelect";
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
  orgId: string;
  canEdit: boolean;
  pendingGroupId: string | null;
  /** Roles you cannot grant are left out, as on the Members page. */
  projectRoles: (current: string | null) => Role[];
  onChange: (group: ProjectGroup, role: GroupRole | null) => void;
};

function projectGroupColumns({
  orgId,
  canEdit,
  pendingGroupId,
  projectRoles,
  onChange,
}: ColumnContext): LangfuseColumnDef<ProjectGroupRow>[] {
  return [
    createTextTableColumn<ProjectGroupRow>({
      accessorKey: "displayName",
      header: "Name",
    }),
    createBadgeTableColumn<ProjectGroupRow>({
      accessorKey: "source",
      header: "Source",
      size: 140,
      range: "decorative",
      getBadge: (value, { row }) => {
        const display = GROUP_SOURCE_DISPLAY[row.original.group.source];
        return { value, variant: display.color, icon: display.icon };
      },
    }),
    createNumberTableColumn<ProjectGroupRow>({
      accessorKey: "memberCount",
      header: "Members",
      size: 100,
    }),
    {
      accessorKey: "orgRole",
      header: "Organization Role",
      headerTooltip: {
        description:
          "The group's organization role applies to every project. It is set in the organization settings.",
        href: "https://langfuse.com/docs/administration/rbac",
      },
      size: 160,
      cell: ({ row }) => (
        <HoverCard
          openDelay={0}
          closeDelay={0}
          placement="right"
          content={
            <div className="w-64 p-3">
              <p className="text-xs">
                The organization-level role of a group can be edited in the{" "}
                <Link
                  href={`/organization/${orgId}/settings/groups`}
                  className="underline"
                >
                  organization settings
                </Link>
                .
              </p>
            </div>
          }
        >
          {({ getTriggerProps }) => (
            <span className="inline-flex" {...getTriggerProps()}>
              <RoleSelect
                roles={["NONE"]}
                value={(row.original.group.orgRole as Role | null) ?? "NONE"}
                canManageOwnership={false}
                size="compact"
                disabled
                onValueChange={() => undefined}
              />
            </span>
          )}
        </HoverCard>
      ),
    },
    {
      accessorKey: "projectRole",
      header: "Project Role",
      headerTooltip: {
        description:
          "Every member of the group gets this role on this project, on top of their own role.",
        href: "https://langfuse.com/docs/administration/rbac",
      },
      size: 160,
      cell: ({ row }) => {
        const { group } = row.original;
        return (
          <RoleSelect
            roles={projectRoles(group.projectRole)}
            value={(group.projectRole as Role | null) ?? "NONE"}
            isProjectRole
            canManageOwnership={false}
            size="compact"
            disabled={!canEdit || pendingGroupId === group.id}
            onValueChange={(role) =>
              onChange(group, role === "NONE" ? null : (role as GroupRole))
            }
          />
        );
      },
    },
  ];
}

// Project admins give the org's groups a role on this project, like project
// roles of members. Groups, their members and org-wide roles are managed in
// the organization settings.
export function ProjectGroupsSettings({
  orgId,
  projectId,
}: {
  orgId: string;
  projectId: string;
}) {
  const session = useSession();
  const hasAdminApi = useHasEntitlement("admin-api");
  const hasProjectRoles = useHasEntitlement("rbac-project-roles");
  const canRead = useHasProjectAccess({
    projectId,
    scope: "projectMembers:read",
  });
  const canEdit =
    useHasProjectAccess({ projectId, scope: "projectMembers:CUD" }) &&
    hasProjectRoles;
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
        orgId,
        canEdit,
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
    [orgId, canEdit, pendingGroupId, session.data, projectId, setRole],
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
          source: GROUP_SOURCE_DISPLAY[group.source].badge,
          memberCount: group.memberCount,
        })),
    };
  }, [groups.isPending, groups.error, groups.data, search]);

  const header = (
    <Header
      title="Project Groups"
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
