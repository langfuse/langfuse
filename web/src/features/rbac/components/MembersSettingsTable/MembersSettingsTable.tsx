/* eslint-disable react/no-unstable-nested-components */
import { useCallback, useMemo } from "react";
import { Trash } from "@langfuse/icons";
import { type Role } from "@langfuse/shared";
import { systemRoleAccessRights } from "@langfuse/shared/rbac";

import { type TableProps } from "@/src/components/design-system/table/Table";
import { type PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import {
  TableCard,
  type TableCardProps,
} from "@/src/components/TableCard/TableCard";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createBadgeListTableColumn } from "@/src/components/design-system/table/columns/createBadgeListTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createUserTableColumn } from "@/src/components/design-system/table/columns/createUserTableColumn";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type GroupMember } from "@/src/features/groups/components/GroupMemberStack";
import { RoleCellTrigger } from "@/src/features/rbac/components/RoleCellTrigger";
import { directRoleColumns } from "./directRoleColumns";
import { byPermissionCount } from "@/src/features/rbac/utils/byPermissionCount";
import { orderedRoles } from "@/src/features/rbac/constants/orderedRoles";
import type { FeaturePreviewFlag } from "@/src/features/feature-flags/available-flags";
import { UserFeaturePreviewsControl } from "@/src/features/feature-flags/components/UserFeaturePreviewsControl";
import type { RouterOutput } from "@/src/utils/types";
import { Popover, PopoverTrigger } from "@/src/components/ui/popover";
import { Button } from "@/src/components/ui/button";
import {
  belowGroupFloor,
  describeRoleCell,
  EffectiveRoleDialogController,
  resolveEffectiveRole,
  type DirectRoleEditor,
  type EffectiveRole,
} from "./EffectiveRoleDialogController";

const formatRoleLabel = (role: Role) => systemRoleAccessRights[role].name;

const allRoles = (Object.keys(orderedRoles) as Role[]).toSorted(
  byPermissionCount,
);

const allProjectRoles = allRoles.filter((role) => role !== "AI_GATEWAY");

const ownerLockedLabel = "Requires owner access";

const roleFilterOptions = allRoles.map((role) => ({
  value: role,
  label: formatRoleLabel(role),
}));

export type MembersSettingsTableRow = {
  user: { image: string | null; name: string | null };
  email: string | null;
  providers: string[];
  createdAt: Date;
  orgRole: Role;
  projectRole?: Role;
  groupRoles: MemberGroupRole[];
  featurePreviews: Record<FeaturePreviewFlag, boolean> | null;
  featurePreviewManagement:
    | RouterOutput["members"]["allFromOrg"]["memberships"][number]["featurePreviewManagement"]
    | null;
  meta: { userId: string; orgMembershipId: string };
};

export type MemberGroupRole = {
  groupId: string;
  groupName: string;
  groupSource: "SCIM" | "MANUAL";
  memberCount: number;
  /** The group's first few members; `memberCount` is the full size. */
  memberPreview: GroupMember[];
  role: Role;
  level: "organization" | "project";
};

type MembersSettingsTableProps = Pick<
  TableProps<MembersSettingsTableRow>,
  "data" | "loadingRowCount"
> & {
  orgId: string;
  project?: { id: string; name: string };
  currentUserId?: string;
  hasOrgViewAccess: boolean;
  hasOrgCudAccess: boolean;
  hasProjectCudAccess: boolean;
  canManageOrgOwnership: boolean;
  canManageProjectOwnership: boolean;
  isAiGatewayEnabled: boolean;
  isGroupsEnabled: boolean;
  projectRolesEntitlement: boolean;
  showFeaturePreviews: boolean;
  updatingOrgRoleMembershipIds: ReadonlySet<string>;
  updatingProjectRoleMembershipIds: ReadonlySet<string>;
  onDelete: (member: MembersSettingsTableRow) => void;
  onUpdateOrgRole: (member: MembersSettingsTableRow, role: Role) => void;
  onUpdateProjectRole: (member: MembersSettingsTableRow, role: Role) => void;
  search: {
    value: string;
    onChange: (value: string) => void;
  };
  roleFilter: {
    value: Role[];
    onChange: (roles: Role[]) => void;
  };
  toolbarActions: TableCardProps<MembersSettingsTableRow>["toolbarActions"];
  pagination: PaginationBarProps;
};

type DirectRoleEditorContext = Pick<
  MembersSettingsTableProps,
  | "project"
  | "projectRolesEntitlement"
  | "hasOrgCudAccess"
  | "hasProjectCudAccess"
  | "canManageOrgOwnership"
  | "canManageProjectOwnership"
  | "isAiGatewayEnabled"
  | "updatingOrgRoleMembershipIds"
  | "updatingProjectRoleMembershipIds"
  | "onUpdateOrgRole"
  | "onUpdateProjectRole"
>;

function projectRoleBlockedReason(
  member: MembersSettingsTableRow,
  ctx: DirectRoleEditorContext,
) {
  if (!ctx.projectRolesEntitlement)
    return "Project roles are not available on your plan.";
  if (!ctx.hasOrgCudAccess && !ctx.hasProjectCudAccess)
    return "You do not have permission to change roles on this project.";
  if (
    (member.projectRole === "OWNER" && !ctx.canManageProjectOwnership) ||
    (member.orgRole === "OWNER" && !ctx.canManageOrgOwnership)
  )
    return ownerLockedLabel;
  return undefined;
}

function orgRoleBlockedReason(
  member: MembersSettingsTableRow,
  ctx: DirectRoleEditorContext,
) {
  if (!ctx.hasOrgCudAccess)
    return "You do not have permission to change roles in this organization.";
  if (member.orgRole === "OWNER" && !ctx.canManageOrgOwnership)
    return ownerLockedLabel;
  return undefined;
}

/** Hover text for a member whose groups do not raise their role. */
const alsoInGroups = (effective: EffectiveRole) =>
  effective.grants.length > 0
    ? `Also in ${[...new Set(effective.grants.map((grant) => grant.groupName))].join(", ")}`
    : undefined;

function directRoleEditor(
  member: MembersSettingsTableRow,
  effective: EffectiveRole,
  ctx: DirectRoleEditorContext,
): DirectRoleEditor {
  const onProject = Boolean(ctx.project);
  const updating = (
    onProject
      ? ctx.updatingProjectRoleMembershipIds
      : ctx.updatingOrgRoleMembershipIds
  ).has(member.meta.orgMembershipId);
  const canManageOwnership = onProject
    ? ctx.canManageProjectOwnership
    : ctx.canManageOrgOwnership;
  const belowFloor = belowGroupFloor(effective, { allowNone: onProject });
  const optionDisabledReason = (role: Role) => {
    if (updating) return "Saving…";
    if (role === "OWNER" && !canManageOwnership) return ownerLockedLabel;
    return belowFloor(role);
  };

  if (onProject) {
    return {
      roles: allProjectRoles,
      value: member.projectRole ?? "NONE",
      isProjectRole: true,
      disabledReason: projectRoleBlockedReason(member, ctx),
      optionDisabledReason,
      onChange: (role) => ctx.onUpdateProjectRole(member, role),
    };
  }
  return {
    roles: allRoles.filter(
      (role) => ctx.isAiGatewayEnabled || role !== "AI_GATEWAY",
    ),
    value: member.orgRole,
    isProjectRole: false,
    disabledReason: orgRoleBlockedReason(member, ctx),
    optionDisabledReason,
    onChange: (role) => ctx.onUpdateOrgRole(member, role),
  };
}

export function MembersSettingsTable({
  orgId,
  project,
  currentUserId,
  hasOrgViewAccess,
  hasOrgCudAccess,
  hasProjectCudAccess,
  canManageOrgOwnership,
  canManageProjectOwnership,
  isAiGatewayEnabled,
  isGroupsEnabled,
  projectRolesEntitlement,
  showFeaturePreviews,
  updatingOrgRoleMembershipIds,
  updatingProjectRoleMembershipIds,
  onDelete,
  onUpdateOrgRole,
  onUpdateProjectRole,
  search,
  roleFilter,
  toolbarActions,
  pagination,
  ...tableProps
}: MembersSettingsTableProps) {
  const columns = useMemo<LangfuseColumnDef<MembersSettingsTableRow>[]>(
    () => [
      createUserTableColumn<MembersSettingsTableRow>({
        accessorKey: "user",
        header: "Name",
        variant: "avatar",
      }),
      createTextTableColumn<MembersSettingsTableRow>({
        accessorKey: "email",
        header: "Email",
        nullValue: "-",
      }),
      createBadgeListTableColumn<MembersSettingsTableRow>({
        accessorKey: "providers",
        header: "SSO Provider",
        enableHiding: true,
      }),
      ...(isGroupsEnabled
        ? [
            {
              accessorKey: project ? "projectRole" : "orgRole",
              header: project ? "Project role" : "Organization role",
              headerTooltip: {
                description: project
                  ? "The roles this member has on this project, from their direct role and their groups. Click it to see where each role comes from and change the direct project role."
                  : "The roles this member has in the organization, from their direct role and their groups. Click it to see where each role comes from and change the direct role.",
                href: "https://langfuse.com/docs/administration/rbac",
              },
              size: 280,
              cell: ({ row }) => {
                const member = row.original;
                const onProject = Boolean(project) && projectRolesEntitlement;
                const effective = resolveEffectiveRole({
                  orgRole: member.orgRole,
                  projectRole: onProject ? member.projectRole : undefined,
                  groupRoles: member.groupRoles,
                  level: onProject ? "project" : "organization",
                });
                const editor = directRoleEditor(member, effective, {
                  project,
                  projectRolesEntitlement,
                  hasOrgCudAccess,
                  hasProjectCudAccess,
                  canManageOrgOwnership,
                  canManageProjectOwnership,
                  isAiGatewayEnabled,
                  updatingOrgRoleMembershipIds,
                  updatingProjectRoleMembershipIds,
                  onUpdateOrgRole,
                  onUpdateProjectRole,
                });
                const cell = describeRoleCell(effective, onProject);
                return (
                  <EffectiveRoleDialogController
                    effective={effective}
                    orgRole={member.orgRole}
                    orgId={orgId}
                    projectId={onProject ? project?.id : undefined}
                    projectName={onProject ? project?.name : undefined}
                    canSeeOrgGroups={hasOrgViewAccess}
                    canManageOrgGroups={hasOrgCudAccess}
                    member={{ name: member.user.name, email: member.email }}
                    editor={editor}
                  >
                    {(openDialog) => (
                      <RoleCellTrigger
                        {...cell}
                        groupHint={cell.groupHint ?? alsoInGroups(effective)}
                        onClick={openDialog}
                      />
                    )}
                  </EffectiveRoleDialogController>
                );
              },
            } satisfies LangfuseColumnDef<MembersSettingsTableRow>,
          ]
        : directRoleColumns({
            project,
            orgRoles: allRoles.filter(
              (role) => isAiGatewayEnabled || role !== "AI_GATEWAY",
            ),
            projectRoles: allProjectRoles,
            ownerLockedLabel,
            hasOrgCudAccess,
            hasProjectCudAccess,
            canManageOrgOwnership,
            canManageProjectOwnership,
            projectRolesEntitlement,
            updatingOrgRoleMembershipIds,
            updatingProjectRoleMembershipIds,
            onUpdateOrgRole,
            onUpdateProjectRole,
          })),
      ...(showFeaturePreviews
        ? ([
            {
              accessorKey: "featurePreviews",
              header: "Feature Previews",
              enableHiding: true,
              size: 140,
              cell: ({ row }) => {
                const { featurePreviews, featurePreviewManagement, meta } =
                  row.original;
                if (!featurePreviews || !featurePreviewManagement) return null;
                return (
                  <Popover>
                    <UserFeaturePreviewsControl
                      orgId={orgId}
                      userId={meta.userId}
                      featurePreviews={featurePreviews}
                      management={featurePreviewManagement}
                    >
                      {({ enabledCount, totalCount, content }) => (
                        <>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm">
                              {enabledCount}/{totalCount} enabled
                            </Button>
                          </PopoverTrigger>
                          {content}
                        </>
                      )}
                    </UserFeaturePreviewsControl>
                  </Popover>
                );
              },
            },
          ] satisfies LangfuseColumnDef<MembersSettingsTableRow>[])
        : []),
      createDateTableColumn<MembersSettingsTableRow>({
        accessorKey: "createdAt",
        header: "Member Since",
        enableHiding: true,
        defaultHidden: true,
        mode: "relative",
      }),
    ],
    [
      canManageOrgOwnership,
      canManageProjectOwnership,
      hasOrgCudAccess,
      hasOrgViewAccess,
      hasProjectCudAccess,
      isAiGatewayEnabled,
      isGroupsEnabled,
      onUpdateOrgRole,
      onUpdateProjectRole,
      orgId,
      project,
      projectRolesEntitlement,
      showFeaturePreviews,
      updatingOrgRoleMembershipIds,
      updatingProjectRoleMembershipIds,
    ],
  );
  const actions = useCallback<
    NonNullable<TableProps<MembersSettingsTableRow>["actions"]>
  >(
    (member) => [
      {
        id: "delete",
        type: "item",
        title:
          member.meta.userId === currentUserId
            ? "Leave organization"
            : "Remove member",
        icon: Trash,
        variant: "destructive",
        disabled:
          hasOrgCudAccess || member.meta.userId === currentUserId
            ? undefined
            : { reason: "You do not have permission to remove this member" },
        onClick: () => onDelete(member),
      },
    ],
    [currentUserId, hasOrgCudAccess, onDelete],
  );

  return (
    <TableCard
      tableName={project ? "project members" : "organization members"}
      columns={columns}
      actions={actions}
      columnVisibilityKey={
        project
          ? "membersColumnVisibilityProject"
          : "membersColumnVisibilityOrg"
      }
      columnOrderKey={
        project ? "membersColumnOrderProject" : "membersColumnOrderOrg"
      }
      search={{
        value: search.value,
        placeholder: "Search name or email",
        onChange: search.onChange,
      }}
      filters={[
        {
          id: "roles",
          label: project ? "Direct project role" : "Direct role",
          placeholder: "All roles",
          options: roleFilterOptions,
          value: roleFilter.value,
          onChange: (values) =>
            roleFilter.onChange(
              roleFilterOptions
                .map((option) => option.value)
                .filter((role) => values.includes(role)),
            ),
        },
      ]}
      toolbarActions={toolbarActions}
      pagination={pagination}
      {...tableProps}
    />
  );
}
