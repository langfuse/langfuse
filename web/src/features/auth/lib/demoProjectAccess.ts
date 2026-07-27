import { env } from "@/src/env.mjs";
import { prisma, Role } from "@langfuse/shared/src/db";

const getDemoProjectConfig = () => {
  const orgId = env.NEXT_PUBLIC_DEMO_ORG_ID?.trim();
  const projectId = env.NEXT_PUBLIC_DEMO_PROJECT_ID?.trim();

  return orgId && projectId ? { orgId, projectId } : null;
};

export const ensureDemoProjectAccess = async ({
  userId,
}: {
  userId: string;
}) => {
  const demoProjectConfig = getDemoProjectConfig();
  if (!demoProjectConfig) return false;

  const demoProject = await prisma.project.findUnique({
    where: {
      orgId: demoProjectConfig.orgId,
      id: demoProjectConfig.projectId,
    },
    select: {
      orgId: true,
    },
  });

  if (!demoProject) return false;

  await prisma.organizationMembership.upsert({
    where: {
      orgId_userId: { orgId: demoProject.orgId, userId },
    },
    update: {},
    create: {
      userId,
      orgId: demoProject.orgId,
      role: Role.VIEWER,
    },
  });

  return true;
};
