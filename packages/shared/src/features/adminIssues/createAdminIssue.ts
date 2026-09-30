import { prisma } from "../../db";
import { logger } from "../../server/logger";
import {
  adminIssueDefinitions,
  type AdminIssueName,
  type RuleIssue,
} from "./adminIssueDefinitions";

export async function createAdminIssue({
  projectId,
  name,
  issue,
}: {
  projectId: string;
  name: AdminIssueName;
  issue: RuleIssue;
}) {
  if (!Object.hasOwn(adminIssueDefinitions, name)) {
    throw new Error(`Unknown admin issue name: ${name}`);
  }

  const definition = adminIssueDefinitions[name];

  try {
    return await prisma.issueLog.create({
      data: {
        projectId,
        issueDefinitionId: definition.id,
        description: issue.description,
        priority: issue.priority,
        ctaLink: issue.ctaLink,
      },
    });
  } catch (error) {
    logger.error("Failed to create admin issue", {
      projectId,
      issueName: name,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    return undefined;
  }
}
