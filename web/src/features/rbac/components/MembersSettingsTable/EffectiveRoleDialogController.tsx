import { useId, useState } from "react";
import Link from "next/link";
import { Lock } from "@langfuse/icons";
import { type Role } from "@langfuse/shared";
import { organizationRoleAccessRights } from "@langfuse/shared/rbac";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { memberCountLabel } from "@/src/features/groups/components/GroupMemberStack";
import { EffectiveRoleCard } from "@/src/features/rbac/components/EffectiveRoleCard";
import { RoleField } from "@/src/features/rbac/components/RoleField";
import { RolePermissionPopup } from "@/src/features/rbac/components/RolePermissionPopup";
import { roleName } from "@/src/features/rbac/components/roleDisplay";
import { RoleWithIcon } from "@/src/features/rbac/components/RoleWithIcon";
import {
  higherRole,
  orderedRoles,
} from "@/src/features/rbac/constants/orderedRoles";
import { byPermissionCount } from "@/src/features/rbac/utils/byPermissionCount";
import { type MemberGroupRole } from "./MembersSettingsTable";

function levelNote(
  grant: MemberGroupRole,
  grants: MemberGroupRole[],
): "project" | "org" | undefined {
  const conflictsAcrossLevels = grants.some(
    (other) =>
      other.groupId === grant.groupId &&
      other.level !== grant.level &&
      other.role !== grant.role,
  );
  if (!conflictsAcrossLevels) return undefined;
  return grant.level === "project" ? "project" : "org";
}

function inheritNoneDescription(orgRole: Role): string {
  if (orgRole === "AI_GATEWAY" || orgRole === "NONE") {
    return `No project access: the organization role (${roleName(orgRole)}) gives none.`;
  }
  return `Keep the organization role (${roleName(orgRole)}) on this project.`;
}

const joinNames = (names: string[]) => [...new Set(names)].join(", ");

/** Roles that rank against each other; a higher one includes a lower one. */
const LADDER: ReadonlySet<Role> = new Set<Role>([
  "OWNER",
  "ADMIN",
  "MEMBER",
  "VIEWER",
]);
const onLadder = (role: Role) => LADDER.has(role);

const gatewayAddsTo = (role: Role) => {
  const scopes = new Set<string>(organizationRoleAccessRights[role]);
  return organizationRoleAccessRights.AI_GATEWAY.some(
    (scope) => !scopes.has(scope),
  );
};

export type EffectiveRole = {
  /** Highest ladder role, plus AI Gateway when it adds permissions; `["NONE"]` when nothing applies. */
  roles: Role[];
  role: Role;
  raisedByGroup: boolean;
  direct: Role;
  directIsOrgDefault: boolean;
  /** Highest ladder role a group grants; direct roles below it cannot be picked. */
  groupFloor: Role | null;
  grants: MemberGroupRole[];
};

/** Mirrors server-side `resolveOrganizationScopes`/`resolveProjectScopes`: ladder roles collapse to the highest, and AI Gateway stays only when it adds permissions (Viewer cannot invoke the gateway). */
export function resolveEffectiveRole({
  orgRole,
  projectRole,
  groupRoles,
  level,
}: {
  orgRole: Role;
  projectRole?: Role;
  groupRoles: MemberGroupRole[];
  level: "organization" | "project";
}): EffectiveRole {
  const onProject = level === "project";
  // AI Gateway has no project permissions, so on a project it counts as no role.
  const atLevel = (role: Role): Role =>
    onProject && role === "AI_GATEWAY" ? "NONE" : role;
  const grants = groupRoles
    .filter((grant) => onProject || grant.level === "organization")
    .filter((grant) => atLevel(grant.role) !== "NONE")
    .toSorted((a, b) => orderedRoles[b.role] - orderedRoles[a.role]);
  const directIsOrgDefault = onProject && projectRole === undefined;
  const direct = atLevel(onProject ? (projectRole ?? orgRole) : orgRole);
  const ladderDirect: Role = onLadder(direct) ? direct : "NONE";
  const groupFloor = grants.find((grant) => onLadder(grant.role))?.role ?? null;
  const role = groupFloor ? higherRole(ladderDirect, groupFloor) : ladderDirect;
  const raisedByGroup = role !== ladderDirect;
  const hasGateway =
    (direct === "AI_GATEWAY" ||
      grants.some((grant) => grant.role === "AI_GATEWAY")) &&
    gatewayAddsTo(role);
  const roles: Role[] = [
    ...(role !== "NONE" ? [role] : []),
    ...(hasGateway ? (["AI_GATEWAY"] as Role[]) : []),
  ].toSorted(byPermissionCount);

  return {
    roles: roles.length > 0 ? roles : ["NONE"],
    role,
    raisedByGroup,
    direct,
    directIsOrgDefault,
    groupFloor,
    grants,
  };
}

const floorGrants = (effective: EffectiveRole) =>
  effective.grants.filter((grant) => grant.role === effective.groupFloor);

export const belowGroupFloor =
  (effective: EffectiveRole, { allowNone }: { allowNone: boolean }) =>
  (role: Role) => {
    const floor = effective.groupFloor;
    // AI Gateway sits beside the ladder, so a group never locks it.
    if (
      !floor ||
      role === "AI_GATEWAY" ||
      orderedRoles[role] >= orderedRoles[floor]
    )
      return undefined;
    if (allowNone && role === "NONE") return undefined;
    const names = joinNames(
      floorGrants(effective).map((grant) => grant.groupName),
    );
    return `Can't go below ${roleName(floor)}: ${names} already gives ${roleName(floor)}, and groups only add access`;
  };

type GroupReason = {
  key: string;
  groupId: string;
  label: string;
  title: string;
  levelNote?: string;
  href: string;
};

type HeldRole = {
  role: Role;
  directTag?: string;
  groups: GroupReason[];
};

function directTag(effective: EffectiveRole, onProject: boolean) {
  if (effective.directIsOrgDefault) return "Inherited from organization";
  return onProject ? "Set on this project" : "Direct";
}

/** NONE grants nothing, so it never appears; on a project a set project role replaces the org role. */
function heldRoles(
  effective: EffectiveRole,
  { orgId, projectId }: { orgId: string; projectId?: string },
): HeldRole[] {
  const byRole = new Map<Role, HeldRole>();
  const held = (role: Role) => {
    const existing = byRole.get(role);
    if (existing) return existing;
    const created: HeldRole = { role, groups: [] };
    byRole.set(role, created);
    return created;
  };
  if (effective.direct !== "NONE")
    held(effective.direct).directTag = directTag(effective, Boolean(projectId));
  for (const grant of effective.grants) {
    const { groups } = held(grant.role);
    if (groups.some((other) => other.groupId === grant.groupId)) continue;
    groups.push({
      key: `${grant.groupId}-${grant.level}`,
      groupId: grant.groupId,
      label: grant.groupName,
      title: `${grant.groupName} · ${grant.level === "project" ? "project group" : "organization group"} · ${memberCountLabel(grant.memberCount)} · ${roleName(grant.role)}`,
      levelNote: levelNote(grant, effective.grants),
      href:
        grant.level === "project" && projectId
          ? `/project/${projectId}/settings/groups`
          : `/organization/${orgId}/settings/groups`,
    });
  }
  return [...byRole.values()].toSorted((a, b) =>
    byPermissionCount(a.role, b.role),
  );
}

function omittedNote(
  effective: EffectiveRole,
  { orgRole, projectId }: { orgRole: Role; projectId?: string },
) {
  if (!projectId || effective.directIsOrgDefault) return null;
  // A None or AI Gateway org role gives nothing on a project; the picker already says so.
  if (orgRole === "NONE" || orgRole === "AI_GATEWAY") return null;
  return `Organization role (${roleName(orgRole)}) doesn't apply here because a project role is set.`;
}

function raisingGrants(effective: EffectiveRole) {
  const { role, raisedByGroup, direct, grants } = effective;
  return grants.filter(
    (grant) =>
      (raisedByGroup && grant.role === role) ||
      (grant.role === "AI_GATEWAY" &&
        direct !== "AI_GATEWAY" &&
        effective.roles.includes("AI_GATEWAY")),
  );
}

function sourceTag(effective: EffectiveRole, onProject: boolean) {
  const raising = raisingGrants(effective);
  if (raising.length > 0)
    return `From ${joinNames(raising.map((grant) => grant.groupName))}`;
  if (effective.directIsOrgDefault) return "Inherited from organization";
  return onProject ? "Set on this project" : "Set directly";
}

const Em = ({ children }: { children: React.ReactNode }) => (
  <span className="text-foreground font-bold">{children}</span>
);

function lockNote(effective: EffectiveRole, firstName: string) {
  const names = joinNames(
    floorGrants(effective).map((grant) => grant.groupName),
  );
  return (
    <>
      Anything below <Em>{roleName(effective.groupFloor ?? effective.role)}</Em>{" "}
      has no effect while {firstName} is in <Em>{names}</Em>. To lower it,
      remove {firstName} from the group.
    </>
  );
}

export type DirectRoleEditor = {
  roles: Role[];
  value: Role;
  isProjectRole: boolean;
  disabledReason?: string;
  optionDisabledReason: (role: Role) => string | undefined;
  onChange: (role: Role) => void;
};

type EffectiveRoleSourceProps = {
  effective: EffectiveRole;
  orgRole: Role;
  orgId: string;
  projectId?: string;
  canSeeOrgSettings: boolean;
  member: { name: string | null; email: string | null };
  editor: DirectRoleEditor;
};

function SourceTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-xs">
      {children}
    </span>
  );
}

function ReasonList({ directTag, groups }: Omit<HeldRole, "role">) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      {directTag && (
        <span className="flex items-baseline gap-2">
          <SourceTag>{directTag}</SourceTag>
        </span>
      )}
      {groups.length > 0 && (
        <span className="flex min-w-0 items-baseline gap-2">
          <SourceTag>{groups.length > 1 ? "Groups" : "Group"}</SourceTag>
          <span className="min-w-0">
            {groups.map((group, index) => (
              <span key={group.key}>
                {index > 0 && <span className="text-muted-foreground">, </span>}
                <Link
                  href={group.href}
                  title={group.title}
                  className="underline-offset-2 hover:underline"
                >
                  {group.label}
                </Link>
                {group.levelNote && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({group.levelNote})
                  </span>
                )}
              </span>
            ))}
          </span>
        </span>
      )}
    </span>
  );
}

function RoleDialog({
  effective,
  orgRole,
  orgId,
  projectId,
  canSeeOrgSettings,
  member,
  editor,
  onDone,
}: EffectiveRoleSourceProps & { onDone: () => void }) {
  const fieldId = useId();
  const onProject = Boolean(projectId);
  const [selected, setSelected] = useState<Role>(editor.value);
  const [permissionsRole, setPermissionsRole] = useState<Role | null>(null);
  const held = heldRoles(effective, { orgId, projectId });
  const omitted = omittedNote(effective, { orgRole, projectId });
  // One direct role and no groups: the card and roles list would only repeat the picker.
  const explain =
    held.length > 1 || held.some(({ groups }) => groups.length > 0);
  const displayName = member.name ?? member.email ?? "this member";
  const firstName = displayName.split(" ")[0] ?? displayName;
  const scopeLabel = onProject ? "on this project" : "in this organization";
  const roleKind = editor.isProjectRole ? "Project role" : "Organization role";

  return (
    <Dialog
      title={roleKind}
      description={`${displayName} ${scopeLabel}`}
      size="default"
      closeLabel="Cancel"
      actions={[
        {
          label: "Save",
          disabled:
            editor.disabledReason !== undefined || selected === editor.value,
          onClick: () => {
            editor.onChange(selected);
            onDone();
          },
        },
      ]}
    >
      <Dialog.Body spacing="compact">
        <div className="flex flex-col gap-3 text-sm">
          {explain && (
            <EffectiveRoleCard
              caption="combined permissions of direct and group roles"
              roles={effective.roles}
              onViewPermissions={setPermissionsRole}
            />
          )}
          {explain && (
            <div className="flex flex-col gap-1">
              <p className="text-muted-foreground text-xs">
                Roles {firstName} holds {scopeLabel}
              </p>
              <ul className="flex flex-col divide-y rounded-md border">
                {held.map(({ role, ...reasons }) => (
                  <li
                    key={role}
                    className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-3 px-3 py-2"
                  >
                    <span className="font-bold">
                      <RoleWithIcon role={role} />
                    </span>
                    <ReasonList {...reasons} />
                  </li>
                ))}
              </ul>
              {omitted && (
                <p className="text-muted-foreground text-xs">{omitted}</p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor={fieldId} className="font-bold">
              Direct {roleKind.toLowerCase()} for {firstName}
            </label>
            {editor.disabledReason ? (
              <p className="text-muted-foreground">{editor.disabledReason}</p>
            ) : (
              <RoleField
                id={fieldId}
                roles={editor.roles}
                value={selected}
                onChange={setSelected}
                noneLabel={
                  editor.isProjectRole ? "Inherit from organization" : undefined
                }
                noneDescription={
                  editor.isProjectRole
                    ? inheritNoneDescription(orgRole)
                    : undefined
                }
                optionDisabledReason={editor.optionDisabledReason}
              />
            )}
            {effective.raisedByGroup && (
              <p className="text-muted-foreground flex items-start gap-2 text-xs">
                <Lock size="sm" aria-hidden="true" __rawClassName="mt-0.5" />
                <span>{lockNote(effective, firstName)}</span>
              </p>
            )}
          </div>

          {onProject && canSeeOrgSettings && (
            <Link
              href={`/organization/${orgId}/settings/members`}
              className="text-muted-foreground w-fit text-xs underline"
            >
              Open organization members
            </Link>
          )}
        </div>
      </Dialog.Body>
      <RolePermissionPopup
        open={permissionsRole !== null}
        onOpenChange={(next) => {
          if (!next) setPermissionsRole(null);
        }}
        role={permissionsRole}
      />
    </Dialog>
  );
}

export function describeRoleCell(effective: EffectiveRole, onProject: boolean) {
  const tag = sourceTag(effective, onProject);
  const names = effective.roles.map(roleName).join(", ");
  return {
    roles: effective.roles,
    label: `${names}, ${tag}. Open role details`,
    groupHint: raisingGrants(effective).length > 0 ? tag : undefined,
  };
}

export function EffectiveRoleDialogController({
  children,
  ...props
}: EffectiveRoleSourceProps & {
  children: (openDialog: () => void) => React.ReactNode;
}) {
  return (
    <DialogController
      renderDialog={({ closeDialog }) => (
        <RoleDialog {...props} onDone={closeDialog} />
      )}
    >
      {({ openDialog }) => children(() => openDialog())}
    </DialogController>
  );
}
