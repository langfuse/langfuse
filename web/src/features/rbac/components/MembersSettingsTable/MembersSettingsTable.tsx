/* eslint-disable react/no-unstable-nested-components */
import { useCallback, useMemo } from "react";
import { Trash } from "@langfuse/icons";
import { type Role } from "@langfuse/shared";
import { systemRoleAccessRights } from "@langfuse/shared/rbac";

import { type TableProps } from "@/src/components/design-system/table/Table";
import { type PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import {
  SettingsTable,
  type SettingsTableProps,
} from "@/src/components/SettingsTable/SettingsTable";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createBadgeListTableColumn } from "@/src/components/design-system/table/columns/createBadgeListTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createUserTableColumn } from "@/src/components/design-system/table/columns/createUserTableColumn";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { RoleSelect } from "@/src/features/rbac/components/RoleSelect";
import { orderedRoles } from "@/src/features/rbac/constants/orderedRoles";
import type { FeaturePreviewFlag } from "@/src/features/feature-flags";
import { UserFeaturePreviewsControl } from "@/src/features/feature-flags/components/UserFeaturePreviewsControl";
import type { RouterOutput } from "@/src/utils/types";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import Link from "next/link";
import { Popover, PopoverTrigger } from "@/src/components/ui/popover";
import { Button } from "@/src/components/ui/button";

const formatRoleLabel = (role: Role) => systemRoleAccessRights[role].name;

const allRoles = Object.keys(orderedRoles) as Role[];

const allProjectRoles = allRoles.filter((role) => role !== "AI_GATEWAY");

const ownerLockedLabel = "Requires owner access";

const roleFilterOptions = allRoles
  .toSorted((a, b) => orderedRoles[b] - orderedRoles[a])
  .map((role) => ({ value: role, label: formatRoleLabel(role) }));

export type MembersSettingsTableRow = {
  user: { image: string | null; name: string | null };
  email: string | null;
  providers: string[];
  createdAt: Date;
  orgRole: Role;
  projectRole?: Role;
  featurePreviews: Record<FeaturePreviewFlag, boolean> | null;
  featurePreviewManagement:
    | RouterOutput["members"]["allFromOrg"]["memberships"][number]["featurePreviewManagement"]
    | null;
  meta: { userId: string; orgMembershipId: string };
};

type MembersSettingsTableProps = Pick<
  TableProps<MembersSettingsTableRow>,
  "data" | "loadingRowCount"
> & {
  orgId: string;
  project?: { id: string; name: string };
  currentUserId?: string;
  hasOrgCudAccess: boolean;
  hasProjectCudAccess: boolean;
  canManageOrgOwnership: boolean;
  canManageProjectOwnership: boolean;
  isAiGatewayEnabled: boolean;
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
  toolbarActions: SettingsTableProps<MembersSettingsTableRow>["toolbarActions"];
  pagination: PaginationBarProps;
};

export function MembersSettingsTable({
  orgId,
  project,
  currentUserId,
  hasOrgCudAccess,
  hasProjectCudAccess,
  canManageOrgOwnership,
  canManageProjectOwnership,
  isAiGatewayEnabled,
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
      {
        accessorKey: "orgRole",
        header: "Organization Role",
        headerTooltip: {
          description:
            "The organization role is the default role for this user across the organization and its projects.",
          href: "https://langfuse.com/docs/administration/rbac",
        },
        size: 160,
        cell: ({ row }) => {
          const isOwnerLocked =
            row.original.orgRole === "OWNER" && !canManageOrgOwnership;
          const select = (
            <RoleSelect
              roles={allRoles.filter(
                (role) => isAiGatewayEnabled || role !== "AI_GATEWAY",
              )}
              canManageOwnership={canManageOrgOwnership}
              value={row.original.orgRole}
              size="compact"
              disabled={
                !hasOrgCudAccess ||
                Boolean(project) ||
                isOwnerLocked ||
                updatingOrgRoleMembershipIds.has(
                  row.original.meta.orgMembershipId,
                )
              }
              onValueChange={(role) => onUpdateOrgRole(row.original, role)}
            />
          );

          if (!project && hasOrgCudAccess && isOwnerLocked) {
            return (
              <Tooltip label={ownerLockedLabel}>
                {({ getTriggerProps }) => (
                  <span className="inline-flex" {...getTriggerProps()}>
                    {select}
                  </span>
                )}
              </Tooltip>
            );
          }

          if (!project || !hasOrgCudAccess) return select;

          return (
            <HoverCard
              openDelay={0}
              closeDelay={0}
              placement="right"
              content={
                <div className="w-64 p-3">
                  <p className="text-xs">
                    The organization-level role can be edited in the{" "}
                    <Link
                      href={`/organization/${orgId}/settings/members`}
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
                  {select}
                </span>
              )}
            </HoverCard>
          );
        },
      },
      ...(project
        ? ([
            {
              accessorKey: "projectRole",
              header: "Project Role",
              headerTooltip: {
                description:
                  "The project role applies to this project and overrides the default organization role.",
                href: "https://langfuse.com/docs/administration/rbac",
              },
              size: 160,
              cell: ({ row }) => {
                if (!projectRolesEntitlement) return "N/A on plan";
                const hasRoleAccess = hasOrgCudAccess || hasProjectCudAccess;
                const isOwnerLocked =
                  (row.original.projectRole === "OWNER" &&
                    !canManageProjectOwnership) ||
                  (row.original.orgRole === "OWNER" && !canManageOrgOwnership);
                const select = (
                  <RoleSelect
                    roles={allProjectRoles}
                    canManageOwnership={canManageProjectOwnership}
                    value={row.original.projectRole ?? "NONE"}
                    isProjectRole
                    size="compact"
                    disabled={
                      !hasRoleAccess ||
                      isOwnerLocked ||
                      updatingProjectRoleMembershipIds.has(
                        row.original.meta.orgMembershipId,
                      )
                    }
                    onValueChange={(role) =>
                      onUpdateProjectRole(row.original, role)
                    }
                  />
                );
                if (!hasRoleAccess || !isOwnerLocked) return select;
                return (
                  <Tooltip label={ownerLockedLabel}>
                    {({ getTriggerProps }) => (
                      <span className="inline-flex" {...getTriggerProps()}>
                        {select}
                      </span>
                    )}
                  </Tooltip>
                );
              },
            },
          ] satisfies LangfuseColumnDef<MembersSettingsTableRow>[])
        : []),
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
      hasProjectCudAccess,
      isAiGatewayEnabled,
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
    <SettingsTable
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
          label: project ? "Project role" : "Role",
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
