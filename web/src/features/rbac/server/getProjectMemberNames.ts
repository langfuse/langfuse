import { Prisma } from "@langfuse/shared";
import { getUserProjectRoles } from "@langfuse/shared/src/server";
import type { ProjectMemberNamesResponse } from "@/src/features/rbac/types/project-member-names";

export async function getProjectMemberNames({
  projectId,
  orgId,
}: {
  projectId: string;
  orgId: string;
}): Promise<ProjectMemberNamesResponse["members"]> {
  const users = await getUserProjectRoles({
    projectId,
    orgId,
    filterCondition: [],
    searchFilter: Prisma.empty,
    orderBy: Prisma.sql`ORDER BY all_eligible_users.name ASC NULLS LAST, all_eligible_users.email ASC NULLS LAST`,
  });

  return users.map((user) => ({
    id: user.id,
    name: user.name || "Unnamed member",
  }));
}
