import { prisma } from "../../db";
import type { Prisma } from "@prisma/client";
import { adminIssueDefinitions } from "./adminIssueDefinitions";

export async function executeAdminIssueRules(projectId: string) {
  const issues: Prisma.IssueLogCreateManyInput[] = [];

  for (const definition of Object.values(adminIssueDefinitions)) {
    const detectedIssues = await definition.callback({ projectId });
    issues.push(
      ...detectedIssues.map((issue) => ({
        projectId,
        issueDefinitionId: definition.id,
        description: issue.description,
        priority: issue.priority,
        ctaLink: issue.ctaLink,
      })),
    );
  }

  if (issues.length === 0) return 0;

  const { count } = await prisma.issueLog.createMany({ data: issues });
  return count;
}
