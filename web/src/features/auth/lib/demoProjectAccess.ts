import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";

export const getDemoProjectConfig = () => {
  const orgId = env.NEXT_PUBLIC_DEMO_ORG_ID?.trim();
  const projectId = env.NEXT_PUBLIC_DEMO_PROJECT_ID?.trim();

  return orgId && projectId ? { orgId, projectId } : null;
};

export const getConfiguredDemoProject = async () => {
  const demoProjectConfig = getDemoProjectConfig();
  if (!demoProjectConfig) return null;

  return await prisma.project.findUnique({
    where: {
      orgId: demoProjectConfig.orgId,
      id: demoProjectConfig.projectId,
    },
    select: {
      id: true,
      orgId: true,
    },
  });
};
