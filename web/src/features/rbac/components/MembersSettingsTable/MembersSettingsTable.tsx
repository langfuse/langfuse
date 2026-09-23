import { useCallback, useMemo } from "react";
import { Trash } from "lucide-react";
import { type Role } from "@langfuse/shared";

import { type TableProps } from "@/src/components/design-system/table/Table";
import { MultiSelectInput } from "@/src/components/design-system/MultiSelectInput/MultiSelectInput";
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
import { RoleSelectItem } from "@/src/features/rbac/components/RoleSelectItem";
import { orderedRoles } from "@/src/features/rbac/constants/orderedRoles";
import type { FeaturePreviewFlag } from "@/src/features/feature-flags";
import { UserFeaturePreviewsControl } from "@/src/features/feature-flags/components/UserFeaturePreviewsPopover";
import type { RouterOutput } from "@/src/utils/types";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  HoverCard,
  HoverCardContent,
  HoverCardPortal,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import Link from "next/link";
import { Popover, PopoverTrigger } from "@/src/components/ui/popover";
import { Button } from "@/src/components/ui/button";

const formatRoleLabel = (role: Role) =>
  role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();

const roleFilterOptions = (Object.keys(orderedRoles) as Role[])
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
        nullValue: "-",
        shouldWrap: true,
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
          const select = (
            <RoleSelect
              value={row.original.orgRole}
              disabled={
                !hasOrgCudAccess ||
                Boolean(project) ||
                updatingOrgRoleMembershipIds.has(
                  row.original.meta.orgMembershipId,
                )
              }
              onChange={(role) => onUpdateOrgRole(row.original, role)}
            />
          );

          if (!project || !hasOrgCudAccess) return select;

          return (
            <HoverCard openDelay={0} closeDelay={0}>
              <HoverCardTrigger asChild>{select}</HoverCardTrigger>
              <HoverCardPortal>
                <HoverCardContent align="center" side="right">
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
                </HoverCardContent>
              </HoverCardPortal>
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
                return (
                  <RoleSelect
                    value={row.original.projectRole ?? "NONE"}
                    isProjectRole
                    disabled={
                      (!hasOrgCudAccess && !hasProjectCudAccess) ||
                      updatingProjectRoleMembershipIds.has(
                        row.original.meta.orgMembershipId,
                      )
                    }
                    onChange={(role) => onUpdateProjectRole(row.original, role)}
                  />
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
      hasOrgCudAccess,
      hasProjectCudAccess,
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
      filters={
        <div className="w-44 shrink-0">
          <MultiSelectInput
            aria-label={project ? "Filter by project role" : "Filter by role"}
            value={roleFilter.value}
            options={roleFilterOptions}
            onValueChange={roleFilter.onChange}
            placeholder="All roles"
            selectedLabel={roleFilter.value
              .toSorted((a, b) => orderedRoles[b] - orderedRoles[a])
              .map(formatRoleLabel)
              .join(", ")}
            searchPlaceholder="Search roles..."
            emptyMessage="No roles found."
          />
        </div>
      }
      toolbarActions={toolbarActions}
      pagination={pagination}
      {...tableProps}
    />
  );
}

function RoleSelect({
  value,
  disabled,
  isProjectRole = false,
  onChange,
}: {
  value: Role;
  disabled: boolean;
  isProjectRole?: boolean;
  onChange: (role: Role) => void;
}) {
  return (
    <Select
      disabled={disabled}
      value={value}
      onValueChange={(role) => onChange(role as Role)}
    >
      <SelectTrigger className="w-[120px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(orderedRoles) as Role[]).map((role) => (
          <RoleSelectItem
            role={role}
            key={role}
            isProjectRole={isProjectRole}
          />
        ))}
      </SelectContent>
    </Select>
  );
}
