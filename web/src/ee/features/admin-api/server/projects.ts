import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";
import {
  OrganizationId,
  ProjectId,
  type TenantId,
} from "@langfuse/shared/rbac";

import { authorize } from "@/src/features/auth/policy/authorize";
import {
  type Action,
  type AuthorizationContext,
} from "@/src/features/auth/policy/types";

// GET - Retrieve all projects in an organization
export async function handleGetProjects(
  req: NextApiRequest,
  res: NextApiResponse,
  orgId: string,
  ctx?: AuthorizationContext,
) {
  const projects = await prisma.project.findMany({
    where: {
      orgId,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return res.status(200).json({
    projects: projects
      .filter(hasPermission(ctx, OrganizationId(orgId), "project:read"))
      .map((project) => ({
        id: project.id,
        name: project.name,
        metadata: project.metadata,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      })),
  });
}

/** hasPermission tests whether ctx permits action on a project in the tenant, allowing all when ctx is absent. */
const hasPermission =
  (ctx: AuthorizationContext | undefined, tenant: TenantId, action: Action) =>
  (project: { id: string }) =>
    !ctx || authorize(ctx, tenant, action, ProjectId(project.id)).success;
