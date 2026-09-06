import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  HoverCardPortal,
} from "@/src/components/ui/hover-card";
import { SelectItem } from "@/src/components/ui/select";
import { projectRoleAccessRights, type Role } from "@langfuse/shared";
import { organizationRoleAccessRights } from "@/src/features/rbac/constants/organizationAccessRights";
import { orderedRoles } from "@/src/features/rbac/constants/orderedRoles";
import { useTranslations } from "next-intl";

export const RoleSelectItem = ({
  role,
  isProjectRole,
}: {
  role: Role;
  isProjectRole?: boolean;
}) => {
  const t = useTranslations("accessSettings.roles");
  const isProjectNoneRole = role === "NONE" && isProjectRole;
  const isOrgNoneRole = role === "NONE" && !isProjectRole;
  const roleLabel = {
    OWNER: t("owner"),
    ADMIN: t("admin"),
    MEMBER: t("member"),
    VIEWER: t("viewer"),
    NONE: t("none"),
  }[role];
  const orgScopes = reduceScopesToListItems(
    organizationRoleAccessRights,
    role,
    t("noScopes"),
  );
  const projectScopes = reduceScopesToListItems(
    projectRoleAccessRights,
    role,
    t("noScopes"),
  );

  return (
    <HoverCard openDelay={0} closeDelay={0}>
      <HoverCardTrigger asChild>
        <SelectItem value={role} className="max-w-56">
          <span>
            {roleLabel}
            {isProjectNoneRole ? ` (${t("keepDefaultRole")})` : ""}
          </span>
        </SelectItem>
      </HoverCardTrigger>
      <HoverCardPortal>
        <HoverCardContent hideWhenDetached={true} align="center" side="right">
          {isProjectNoneRole ? (
            <div className="text-xs">{t("projectNoneDescription")}</div>
          ) : isOrgNoneRole ? (
            <div className="text-xs">{t("organizationNoneDescription")}</div>
          ) : (
            <>
              <div className="font-bold">{t("role", { role: roleLabel })}</div>
              <p className="mt-2 text-xs font-bold">
                {t("organizationScopes")}
              </p>
              <ul className="list-inside list-disc text-xs">{orgScopes}</ul>
              <p className="mt-2 text-xs font-bold">{t("projectScopes")}</p>
              <ul className="list-inside list-disc text-xs">{projectScopes}</ul>
              <p className="mt-2 border-t pt-2 text-xs">
                {t("note")}{" "}
                <span className="text-muted-foreground">
                  {t("mutedScopes")}
                </span>{" "}
                {t("inheritedScopes")}
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
  noneLabel: string,
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
            <span className="font-bold">
              {newActions.length > 0 ? newActions.join(", ") : ""}
            </span>
          </li>
        );
      })}
    </>
  ) : (
    <li>{noneLabel}</li>
  );
};
