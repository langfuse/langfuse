import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";

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
      .filter(hasPermission(ctx, "project:read"))
      .map((project) => ({
        id: project.id,
        name: project.name,
        metadata: project.metadata,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      })),
  });
}

/** hasPermission tests whether ctx permits action on a project, allowing all when ctx is absent. */
const hasPermission =
  (ctx: AuthorizationContext | undefined, action: Action) =>
  (project: { id: string }) =>
    !ctx || authorize(ctx, action, { projectId: project.id }).success;
