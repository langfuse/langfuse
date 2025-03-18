import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { SelectItem } from "@/src/components/ui/select";
import { Role } from "@langfuse/shared";
import { HoverCardPortal } from "@radix-ui/react-hover-card";
import {
  organizationRoleAccessRights,
  orgNoneRoleComment,
} from "@/src/features/rbac/constants/organizationAccessRights";
import {
  projectNoneRoleComment,
  projectRoleAccessRights,
} from "@/src/features/rbac/constants/projectAccessRights";
import { orderedRoles } from "@/src/features/rbac/constants/orderedRoles";

export const RoleSelectItem = ({
  role,
  isProjectRole,
}: {
  role: Role;
  isProjectRole?: boolean;
}) => {
  const isProjectNoneRole = role === Role.NONE && isProjectRole;
  const isOrgNoneRole = role === Role.NONE && !isProjectRole;
  const orgScopes = reduceScopesToListItems(organizationRoleAccessRights, role);
  const projectScopes = reduceScopesToListItems(projectRoleAccessRights, role);

  return (
    <HoverCard openDelay={0} closeDelay={0}>
      <HoverCardTrigger asChild>
        <SelectItem value={role} className="max-w-56">
          <span>
            {formatRole(role)}
            {isProjectNoneRole ? " (keep default role)" : ""}
          </span>
        </SelectItem>
      </HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent hideWhenDetached={true} align="center" side="right">
          {isProjectNoneRole ? (
            <div className="text-xs">{projectNoneRoleComment}</div>
          ) : isOrgNoneRole ? (
            <div className="text-xs">{orgNoneRoleComment}</div>
          ) : (
            <>
              <div className="font-bold">Role: {formatRole(role)}</div>
              <p className="mt-2 text-xs font-semibold">Organization Scopes</p>
              <ul className="list-inside list-disc text-xs">{orgScopes}</ul>
              <p className="mt-2 text-xs font-semibold">Project Scopes</p>
              <ul className="list-inside list-disc text-xs">{projectScopes}</ul>
              <p className="mt-2 border-t pt-2 text-xs">
                Note:{" "}
                <span className="text-muted-foreground">Muted scopes</span> are
                inherited from lower role.
              </p>
            </>
          )}
        </HoverCardContent>
      </HoverCardPortal>
    </HoverCard>
  );
};

const reduceScopesToListItems = (
  accessRights: Record<string, string[]>,
  role: Role,
) => {
  const currentRoleLevel = orderedRoles[role];
  const lowerRole = Object.entries(orderedRoles).find(
    ([_role, level]) => level === currentRoleLevel - 1,
  )?.[0] as Role | undefined;
  const inheritedScopes = lowerRole ? accessRights[lowerRole] : [];

  return accessRights[role].length > 0 ? (
    <>
      {Object.entries(
        accessRights[role].reduce(
          (acc, scope) => {
            const [resource, action] = scope.split(":");
            if (!acc[resource]) {
              acc[resource] = [];
            }
            acc[resource].push(action);
            return acc;
          },
          {} as Record<string, string[]>,
        ),
      ).map(([resource, actions]) => {
        const inheritedActions = actions.filter((action) =>
          inheritedScopes.includes(`${resource}:${action}`),
        );
        const newActions = actions.filter(
          (action) => !inheritedScopes.includes(`${resource}:${action}`),
        );

        return (
          <li key={resource}>
            <span>{resource}: </span>
            <span className="text-muted-foreground">
              {inheritedActions.length > 0 ? inheritedActions.join(", ") : ""}
              {newActions.length > 0 && inheritedActions.length > 0 ? ", " : ""}
            </span>
            <span className="font-semibold">
              {newActions.length > 0 ? newActions.join(", ") : ""}
            </span>
          </li>
        );
      })}
    </>
  ) : (
    <li>None</li>
  );
};

const formatRole = (role: Role) =>
  role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
