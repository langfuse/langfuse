import { prisma } from "../../db";
import { logger } from "../../server/logger";
import {
  adminIssueDefinitions,
  type AdminIssueDefinition,
} from "./adminIssueDefinitions";

export async function executeAdminIssueRules(projectId: string) {
  const definitions: AdminIssueDefinition[] = Object.values(
    adminIssueDefinitions,
  );
  const counts = await Promise.all(
    definitions.map(async (definition) => {
      if (!definition.callback) return 0;

      try {
        const issues = await definition.callback(projectId);
        if (issues.length === 0) return 0;

        const previousIssue = await prisma.issueLog.findFirst({
          where: { projectId, issueDefinitionId: definition.id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { ignoredAt: true, ignoreReason: true },
        });

        const { count } = await prisma.issueLog.createMany({
          data: issues.map((issue) => ({
            projectId,
            issueDefinitionId: definition.id,
            description: issue.description,
            priority: issue.priority,
            ctaLink: issue.ctaLink,
            ignoredAt: previousIssue?.ignoredAt ?? null,
            ignoreReason: previousIssue?.ignoreReason ?? null,
          })),
        });
        return count;
      } catch (error) {
        logger.error("Failed to execute admin issue rule", {
          projectId,
          issueDefinitionId: definition.id,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        });
        return 0;
      }
    }),
  );

  return counts.reduce((total, count) => total + count, 0);
}
