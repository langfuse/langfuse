import { prisma, Prisma } from "@langfuse/shared/src/db";
import {
  logger,
  recordGauge,
  recordIncrement,
  redis,
} from "@langfuse/shared/src/server";
import { deleteInAppAgentMcpApiKeyFromDb } from "@langfuse/shared/src/server/auth/apiKeys";
import { isEnterpriseLicenseAvailable } from "@langfuse/shared/src/server/ee/licenseCheck";
import { cleanupRunMcpApiKey } from "@langfuse/shared/in-app-agent/server/runLifecycle";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";

const BATCH_LIMIT = 100;
const INTERVAL_MS = 600_000;

export class InAppAgentRetentionCleaner extends PeriodicExclusiveRunner {
  protected get defaultIntervalMs(): number {
    return INTERVAL_MS;
  }

  constructor() {
    super({
      name: "InAppAgentRetentionCleaner",
      metricName: "in_app_agent_retention_cleaner",
      lockKey: "langfuse:in-app-agent-retention-cleaner",
      lockTtlSeconds: 300,
      onUnavailable: "fail",
    });
  }

  protected async execute(): Promise<number> {
    if (!isEnterpriseLicenseAvailable()) {
      return this.defaultIntervalMs;
    }

    const nextDelay = await this.withLock(async () => {
      // Unfinished runs belong to the integrity runner. Excluding them here
      // prevents an unrepairable conversation from blocking actionable work.
      const conversations = await prisma.$queryRaw<
        Array<{ id: string; projectId: string }>
      >`
        SELECT c.id, c.project_id AS "projectId"
        FROM in_app_agent_conversations c
        JOIN projects p ON p.id = c.project_id
        WHERE p.retention_days > 0
          AND p.deleted_at IS NULL
          AND c.updated_at < (NOW() AT TIME ZONE 'UTC') - p.retention_days * INTERVAL '1 day'
          AND NOT EXISTS (
            SELECT 1 FROM in_app_agent_runs r
            WHERE r.project_id = c.project_id AND r.conversation_id = c.id
              AND r.finished_at IS NULL
          )
        ORDER BY c.id, c.project_id
        LIMIT ${BATCH_LIMIT}
      `;

      if (conversations.length > 0) {
        const keyRuns = await prisma.inAppAgentRun.findMany({
          where: {
            OR: conversations.map(({ id, projectId }) => ({
              projectId,
              conversationId: id,
            })),
            finishedAt: { not: null },
            mcpApiKeyId: { not: null },
          },
          select: {
            id: true,
            projectId: true,
            mcpApiKeyId: true,
          },
          take: BATCH_LIMIT,
        });

        let cleanedRuns = 0;
        for (const run of keyRuns) {
          if (!run.mcpApiKeyId) continue;
          await this.extendLockOnProgress();
          try {
            await cleanupRunMcpApiKey({
              prisma,
              projectId: run.projectId,
              runId: run.id,
              apiKeyId: run.mcpApiKeyId,
              deleteApiKey: async (id) => {
                await deleteInAppAgentMcpApiKeyFromDb({
                  prisma,
                  id,
                  projectId: run.projectId,
                  redis,
                });
              },
            });
            cleanedRuns++;
          } catch (error) {
            this.markRunFailed(error);
            logger.error(
              `${this.instanceName}: Failed to clean run credentials`,
              {
                error,
                id: run.id,
                projectId: run.projectId,
              },
            );
          }
        }

        await this.extendLockOnProgress(true);
        // Re-evaluate the live policy and run guards at deletion time, after
        // potentially slow credential cleanup. Runs and events cascade.
        const deleted = await prisma.$executeRaw`
        DELETE FROM in_app_agent_conversations c
        USING projects p, (VALUES ${Prisma.join(
          conversations.map(
            ({ id, projectId }) => Prisma.sql`(${id}, ${projectId})`,
          ),
        )}) AS selected(id, project_id)
        WHERE c.id = selected.id AND c.project_id = selected.project_id
          AND p.id = c.project_id
          AND p.retention_days > 0 AND p.deleted_at IS NULL
          AND c.updated_at < (NOW() AT TIME ZONE 'UTC') - p.retention_days * INTERVAL '1 day'
          AND NOT EXISTS (
            SELECT 1 FROM in_app_agent_runs r
            WHERE r.project_id = c.project_id AND r.conversation_id = c.id
              AND (r.finished_at IS NULL OR r.mcp_api_key_id IS NOT NULL)
          )
      `;

        recordIncrement(
          "langfuse.in_app_agent_retention_cleaner.conversations_deleted",
          deleted,
        );
        logger.info(`${this.instanceName}: Deleted expired conversations`, {
          deleted,
          cleanedRuns,
        });
        if (cleanedRuns > 0 || deleted > 0) {
          return 0;
        }
      }

      // Include blocked conversations, and report even when failures prevent progress.
      const [backlog] = await prisma.$queryRaw<
        Array<{ overdueSeconds: number }>
      >`
        SELECT GREATEST(COALESCE(MAX(EXTRACT(EPOCH FROM (
          (NOW() AT TIME ZONE 'UTC') - c.updated_at - p.retention_days * INTERVAL '1 day'
        ))), 0), 0)::double precision AS "overdueSeconds"
        FROM in_app_agent_conversations c
        JOIN projects p ON p.id = c.project_id
        WHERE p.retention_days > 0
          AND p.deleted_at IS NULL
          AND c.updated_at < (NOW() AT TIME ZONE 'UTC') - p.retention_days * INTERVAL '1 day'
      `;
      recordGauge(
        "langfuse.in_app_agent_retention_cleaner.max_conversation_retention_lag_seconds",
        backlog!.overdueSeconds,
        { unit: "seconds" },
      );
      return this.defaultIntervalMs;
    });

    return nextDelay ?? this.defaultIntervalMs;
  }
}
