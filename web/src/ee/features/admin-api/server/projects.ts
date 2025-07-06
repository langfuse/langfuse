import { type NextApiRequest, type NextApiResponse } from "next";
import { prisma } from "@langfuse/shared/src/db";

// GET - Retrieve all projects in an organization
export async function handleGetProjects(
  req: NextApiRequest,
  res: NextApiResponse,
  orgId: string,
) {
  const projects = await prisma.project.findMany({
    where: {
      orgId,
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
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      metadata: project.metadata,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    })),
  });
}
