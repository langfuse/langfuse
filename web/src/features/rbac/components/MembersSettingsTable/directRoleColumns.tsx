import Link from "next/link";
import { type Role } from "@langfuse/shared";

import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { RoleSelect } from "@/src/features/rbac/components/RoleSelect";
import { type MembersSettingsTableRow } from "./MembersSettingsTable";

type DirectRoleColumnsContext = {
  orgId: string;
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

function OwnerLockTooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      {({ getTriggerProps }) => (
        <span className="inline-flex" {...getTriggerProps()}>
          {children}
        </span>
      )}
    </Tooltip>
  );
}

/**
 * directRoleColumns shows each member's direct organization role and, on a
 * project, their direct project role, each as an editable role select.
 */
export function directRoleColumns({
  orgId,
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
  const orgRoleColumn: LangfuseColumnDef<MembersSettingsTableRow> = {
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
            Boolean(project) ||
            isOwnerLocked ||
            updatingOrgRoleMembershipIds.has(row.original.meta.orgMembershipId)
          }
          onValueChange={(role) => onUpdateOrgRole(row.original, role)}
        />
      );

      if (!project && hasOrgCudAccess && isOwnerLocked) {
        return (
          <OwnerLockTooltip label={ownerLockedLabel}>{select}</OwnerLockTooltip>
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
  };

  if (!project) return [orgRoleColumn];

  return [
    orgRoleColumn,
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
            onValueChange={(role) => onUpdateProjectRole(row.original, role)}
          />
        );
        if (!hasRoleAccess || !isOwnerLocked) return select;
        return (
          <OwnerLockTooltip label={ownerLockedLabel}>{select}</OwnerLockTooltip>
        );
      },
    },
  ];
}
