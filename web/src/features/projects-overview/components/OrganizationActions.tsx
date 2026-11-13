import { Plus, Settings, Users } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { useHasOrganizationAccess } from "@/src/features/rbac/utils/checkOrganizationAccess";
import { createProjectRoute } from "@/src/features/setup/setupRoutes";

/** Settings, members and project creation for one organization, each shown only to roles that may use it. */
export function OrganizationActions({
  organizationId,
}: {
  organizationId: string;
}) {
  const canReadMembers = useHasOrganizationAccess({
    organizationId,
    scope: "organizationMembers:read",
  });
  const canReadSettings = useHasOrganizationAccess({
    organizationId,
    scope: "organizationSettings:read",
  });
  const canCreateProjects = useHasOrganizationAccess({
    organizationId,
    scope: "projects:create",
  });

  return (
    <div className="ph-no-capture flex flex-wrap items-center gap-1">
      {canReadSettings ? (
        <Button
          href={`/organization/${organizationId}/settings`}
          text="Settings"
          icon={Settings}
          variant="ghost"
          size="sm"
        />
      ) : null}
      {canReadMembers ? (
        <Button
          href={`/organization/${organizationId}/settings/members`}
          text="Members"
          icon={Users}
          variant="ghost"
          size="sm"
        />
      ) : null}
      {canCreateProjects ? (
        <Button
          href={createProjectRoute(organizationId)}
          text="New project"
          icon={Plus}
          variant="outline"
          size="sm"
        />
      ) : null}
    </div>
  );
}
