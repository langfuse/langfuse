import { type Role } from "@langfuse/shared";

import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { RoleSelect } from "@/src/features/rbac/components/RoleSelect";
import { type MembersSettingsTableRow } from "./MembersSettingsTable";

type DirectRoleColumnsContext = {
  project?: { id: string };
  orgRoles: Role[];
  projectRoles: Role[];
  ownerLockedLabel: string;
  hasOrgCudAccess: boolean;
  hasProjectCudAccess: boolean;
  canManageOrgOwnership: boolean;
  canManageProjectOwnership: boolean;
  projectRolesEntitlement: boolean;
  updatingOrgRoleMembershipIds: ReadonlySet<string>;
  updatingProjectRoleMembershipIds: ReadonlySet<string>;
  onUpdateOrgRole: (member: MembersSettingsTableRow, role: Role) => void;
  onUpdateProjectRole: (member: MembersSettingsTableRow, role: Role) => void;
};

/**
 * The role columns for organizations without Groups: the role pickers as they
 * were before groups, edited in place. On a project only the project role is
 * shown; "None (keep default role)" means the organization role applies.
 */
export function directRoleColumns({
  project,
  orgRoles,
  projectRoles,
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
}: DirectRoleColumnsContext): LangfuseColumnDef<MembersSettingsTableRow>[] {
  return [
    // On a project the organization role is not shown as its own column: the
    // project role column says when it is inherited instead.
    ...(project
      ? []
      : ([
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
                  roles={orgRoles}
                  canManageOwnership={canManageOrgOwnership}
                  value={row.original.orgRole}
                  size="compact"
                  disabled={
                    !hasOrgCudAccess ||
                    isOwnerLocked ||
                    updatingOrgRoleMembershipIds.has(
                      row.original.meta.orgMembershipId,
                    )
                  }
                  onValueChange={(role) => onUpdateOrgRole(row.original, role)}
                />
              );

              if (hasOrgCudAccess && isOwnerLocked) {
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

              return select;
            },
          },
        ] satisfies LangfuseColumnDef<MembersSettingsTableRow>[])),
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
            size: 220,
            cell: ({ row }) => {
              // Without project roles on the plan, members get their
              // organization role here: show it, read-only, and say why.
              if (!projectRolesEntitlement)
                return (
                  <span className="inline-flex min-w-0 flex-col gap-0.5">
                    <RoleSelect
                      roles={[row.original.orgRole]}
                      canManageOwnership={false}
                      value={row.original.orgRole}
                      size="compact"
                      disabled
                      onValueChange={() => undefined}
                    />
                    <span className="text-muted-foreground text-xs">
                      From organization · not on this plan
                    </span>
                  </span>
                );
              const hasRoleAccess = hasOrgCudAccess || hasProjectCudAccess;
              const isOwnerLocked =
                (row.original.projectRole === "OWNER" &&
                  !canManageProjectOwnership) ||
                (row.original.orgRole === "OWNER" && !canManageOrgOwnership);
              const select = (
                <RoleSelect
                  roles={projectRoles}
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
  ];
}
