import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@langfuse/shared/src/db";
import { logger, redis } from "@langfuse/shared/src/server";
import { ProjectService } from "@/src/features/projects/server/projectService";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";

const TransferProjectQuery = z.object({ projectId: z.string().min(1) });
const TransferProjectBody = z.object({
  targetOrganizationId: z.string().min(1),
});

/**
 * handleTransferProject moves a project into another organization on behalf of
 * the instance admin. The ADMIN_API_KEY holds authority over every
 * organization, so it stands in for `projects:transfer_org` on both sides.
 */
export async function handleTransferProject(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const query = TransferProjectQuery.safeParse(req.query);
  if (!query.success) {
    return res.status(400).json({ error: "Invalid project ID" });
  }
  const body = TransferProjectBody.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: z.formatError(body.error),
    });
  }
  const { projectId } = query.data;
  const { targetOrganizationId } = body.data;

  const project = await prisma.project.findUnique({
    where: { id: projectId, deletedAt: null },
    select: { orgId: true },
  });
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }
  if (project.orgId === targetOrganizationId) {
    return res.status(200).json({ projectId, organizationId: project.orgId });
  }

  const targetOrganization = await prisma.organization.findUnique({
    where: { id: targetOrganizationId },
    select: { id: true },
  });
  if (!targetOrganization) {
    return res.status(404).json({ error: "Target organization not found" });
  }

  await new ProjectService(prisma, new ApiAuthService(prisma, redis)).transfer({
    organizationId: project.orgId,
    targetOrganizationId,
    projectId,
    actor: { apiKeyId: "ADMIN_KEY", orgId: project.orgId, projectId },
  });

  logger.info(
    `Transferred project ${projectId} from organization ${project.orgId} to ${targetOrganizationId} via admin API`,
  );

  return res.status(200).json({
    projectId,
    organizationId: targetOrganizationId,
  });
}
