import { Plus, Settings, Users } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { useHasOrganizationAccess } from "@/src/features/rbac";
import { createProjectRoute } from "@/src/features/setup";

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
  const canCreateProjects = useHasOrganizationAccess({
    organizationId,
    scope: "projects:create",
  });

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button
        href={`/organization/${organizationId}/settings`}
        text="Settings"
        icon={Settings}
        variant="ghost"
        size="sm"
      />
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
