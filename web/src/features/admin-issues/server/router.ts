import { randomUUID } from "crypto";
import { z } from "zod";
import { InternalServerError } from "@langfuse/shared";

import { throwIfNoProjectAccess } from "@/src/features/rbac";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  AdminIssueDetectionQueue,
  adminIssueDefinitions,
  QueueJobs,
  type QueueName,
  type TQueueJobTypes,
} from "@langfuse/shared/src/server";

const ISSUE_LIST_LIMIT = 100;

export const adminIssuesRouter = createTRPCRouter({
  getIssues: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:CUD",
      });

      const issues = await ctx.prisma.issueLog.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: "desc" },
        take: ISSUE_LIST_LIMIT,
      });

      return issues.map((issue) => {
        const definition = Object.values(adminIssueDefinitions).find(
          (definition) => definition.id === issue.issueDefinitionId,
        );

        return {
          id: issue.id,
          issueDefinitionId: issue.issueDefinitionId,
          // Rows can outlive the rule that created them, so fall back to the stored id.
          ruleName: definition?.name ?? issue.issueDefinitionId,
          description: issue.description,
          priority: issue.priority,
          ctaLink: issue.ctaLink,
          createdAt: issue.createdAt,
          doneAt: issue.doneAt,
          ignoredAt: issue.ignoredAt,
        };
      });
    }),

  runDetection: protectedProjectProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "automations:CUD",
      });

      const queue = AdminIssueDetectionQueue.getInstance();
      if (!queue) {
        throw new InternalServerError(
          "AdminIssueDetectionQueue not initialized",
        );
      }

      // Repeated clicks collapse into one job until the queued job completes or fails.
      await queue.add(
        QueueJobs.AdminIssueDetectionJob,
        {
          id: randomUUID(),
          name: QueueJobs.AdminIssueDetectionJob,
          timestamp: new Date(),
          payload: { projectId: input.projectId },
        } satisfies TQueueJobTypes[QueueName.AdminIssueDetectionQueue],
        { deduplication: { id: `admin-issue-detection-${input.projectId}` } },
      );

      return { success: true };
    }),
});
