import { PlusIcon, Settings } from "@langfuse/icons";
import Link from "next/link";

import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { createProjectRoute } from "@/src/features/setup/setupRoutes";

export type OrganizationSettingsTileProps = {
  orgId: string;
  canCreateProject: boolean;
};

/** OrganizationSettingsTile links to the org's settings, and to project creation when allowed */
export const OrganizationSettingsTile = ({
  orgId,
  canCreateProject,
}: OrganizationSettingsTileProps) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">No projects</CardTitle>
      <CardDescription>
        {canCreateProject
          ? "This organization has no projects yet."
          : "You don't have access to any projects in this organization."}
      </CardDescription>
    </CardHeader>
    <CardFooter className="gap-2">
      {canCreateProject && (
        <Button asChild>
          <Link href={createProjectRoute(orgId)}>
            <PlusIcon size="base" __rawClassName="mr-2" aria-hidden="true" />
            New project
          </Link>
        </Button>
      )}
      <Button asChild variant="secondary">
        <Link href={`/organization/${orgId}/settings`}>
          <Settings size="base" __rawClassName="mr-2" aria-hidden="true" />
          Organization settings
        </Link>
      </Button>
    </CardFooter>
  </Card>
);
