import { prisma, type Prisma } from "@langfuse/shared/src/db";
import { logger, recordGauge, redis } from "@langfuse/shared/src/server";
import { deleteInAppAgentMcpApiKeyFromDb } from "@langfuse/shared/src/server/auth/apiKeys";
import {
  IN_APP_AGENT_UNSETTLED_RUN_STATUSES,
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
} from "@langfuse/shared/in-app-agent";
import {
  classifyStaleRun,
  cleanupTerminalRunMcpApiKeys,
  reconcileConversationRuns,
} from "@langfuse/shared/in-app-agent/server/runLifecycle";
import {
  IN_APP_AGENT_APPROVAL_TTL_MS,
  IN_APP_AGENT_HEARTBEAT_STALE_MS,
  IN_APP_AGENT_QUEUE_TIMEOUT_MS,
  IN_APP_AGENT_RUN_MAX_DURATION_MS,
} from "@langfuse/shared/in-app-agent/server/tunables";

import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";

const METRIC_PREFIX = "langfuse.in_app_agent";

const IN_APP_AGENT_INTEGRITY_RUNNER_LOCK_KEY =
  "langfuse:in-app-agent-integrity-runner";

const LOCK_TTL_SECONDS = 120;
const SCAN_LIMIT = 5_000;

const REPORTED_FINDINGS = [
  InAppAgentRunErrorCode.QUEUE_TIMEOUT,
  InAppAgentRunErrorCode.WORKER_LOST,
  InAppAgentRunErrorCode.RUN_TIMEOUT,
  InAppAgentRunErrorCode.APPROVAL_EXPIRED,
];

/**
 * Reconciles stale in-app agent runs that nobody reopened, then reports what
 * remains. Read paths still reconcile on attach; this runner is the backstop
 * so a conversation nobody opens cannot hold a slot forever.
 *
 * Writes go through `reconcileConversationRuns` so the verdict cannot drift
 * from web. Gauges are emitted after repair.
 */
export class InAppAgentIntegrityRunner extends PeriodicExclusiveRunner {
  private readonly intervalMs: number;

  protected get defaultIntervalMs(): number {
    return this.intervalMs;
  }

  constructor(opts: { intervalMs?: number } = {}) {
    super({
      name: "InAppAgentIntegrityRunner",
      metricName: "in_app_agent_integrity_runner",
      lockKey: IN_APP_AGENT_INTEGRITY_RUNNER_LOCK_KEY,
      lockTtlSeconds: LOCK_TTL_SECONDS,
      onUnavailable: "fail",
    });

    this.intervalMs =
      opts.intervalMs ?? env.LANGFUSE_IN_APP_AGENT_INTEGRITY_RUNNER_INTERVAL_MS;
  }

  public override start(): void {
    logger.info(`Starting ${this.instanceName}`, {
      intervalMs: this.intervalMs,
    });
    super.start();
  }

  protected async execute(): Promise<number | void> {
    return await this.withLock(async () => {
      await this.reconcileAndReportUnsettledRuns();
      await this.reportOrphanedMcpApiKeys();
    });
  }

  private async reconcileAndReportUnsettledRuns(): Promise<void> {
    const now = Date.now();
    const candidates = await prisma.inAppAgentRun.findMany({
      where: staleRunWhere(now),
      select: {
        id: true,
        projectId: true,
        conversationId: true,
        status: true,
        createdAt: true,
        claimedAt: true,
        heartbeatAt: true,
        finishedAt: true,
      },
      take: SCAN_LIMIT,
    });

    if (candidates.length === SCAN_LIMIT) {
      logger.warn(
        `${this.instanceName}: stale run scan hit its limit; repair is a floor`,
        { scanLimit: SCAN_LIMIT },
      );
    }

    const staleConversations = new Map<
      string,
      { projectId: string; conversationId: string }
    >();

    for (const run of candidates) {
      if (!classifyStaleRun(run, now)) continue;
      staleConversations.set(`${run.projectId}:${run.conversationId}`, {
        projectId: run.projectId,
        conversationId: run.conversationId,
      });
    }

    const reconciledIds = new Set<string>();

    for (const { projectId, conversationId } of staleConversations.values()) {
      await this.extendLockOnProgress();

      try {
        const reconciled = await reconcileConversationRuns({
          prisma,
          projectId,
          conversationId,
        });

        for (const run of reconciled) {
          reconciledIds.add(run.runId);
        }

        if (reconciled.length === 0) continue;

        await cleanupTerminalRunMcpApiKeys({
          prisma,
          projectId,
          conversationId,
          deleteApiKey: async (apiKeyId) => {
            await deleteInAppAgentMcpApiKeyFromDb({
              prisma,
              id: apiKeyId,
              projectId,
              redis,
            });
          },
        });
      } catch (error) {
        logger.error(`${this.instanceName}: failed to reconcile conversation`, {
          projectId,
          conversationId,
          error,
        });
      }
    }

    const activeByStatusRows = await prisma.inAppAgentRun.groupBy({
      by: ["status"],
      where: { status: { in: [...IN_APP_AGENT_UNSETTLED_RUN_STATUSES] } },
      _count: { _all: true },
    });

    const activeByStatus = new Map<string, number>(
      IN_APP_AGENT_UNSETTLED_RUN_STATUSES.map((status) => [status, 0]),
    );
    for (const row of activeByStatusRows) {
      if (row.status) {
        activeByStatus.set(row.status, row._count._all);
      }
    }

    const findings = new Map<string, number>(
      REPORTED_FINDINGS.map((code) => [code, 0]),
    );
    for (const run of candidates) {
      const stale = classifyStaleRun(run, now);
      if (!stale || reconciledIds.has(run.id)) continue;
      findings.set(stale.errorCode, (findings.get(stale.errorCode) ?? 0) + 1);
    }

    for (const [status, count] of activeByStatus) {
      recordGauge(`${METRIC_PREFIX}.active_runs`, count, { status });
    }

    for (const [finding, count] of findings) {
      recordGauge(`${METRIC_PREFIX}.lifecycle_integrity`, count, { finding });
    }
  }

  /**
   * Scoped MCP keys are deleted best-effort when a run ends, and the pointer is
   * cleared only after the delete confirms. Two different problems hide behind a
   * lingering pointer, so they are counted apart: `live_key` is a credential
   * that still exists and never expires, `stuck_pointer` is a pointer whose key
   * is already gone, which is harmless but retries and logs an error on every
   * conversation read.
   */
  private async reportOrphanedMcpApiKeys(): Promise<void> {
    const runs = await prisma.inAppAgentRun.findMany({
      where: {
        finishedAt: { not: null },
        mcpApiKeyId: { not: null },
        status: { notIn: [InAppAgentRunStatus.AWAITING_APPROVAL] },
      },
      select: { mcpApiKeyId: true },
      take: SCAN_LIMIT,
    });

    if (runs.length === SCAN_LIMIT) {
      logger.warn(
        `${this.instanceName}: MCP key scan hit its limit; counts are a floor`,
        { scanLimit: SCAN_LIMIT },
      );
    }

    const pointerIds = runs
      .map((run) => run.mcpApiKeyId)
      .filter((id): id is string => Boolean(id));

    let liveKeys = 0;
    if (pointerIds.length > 0) {
      liveKeys = await prisma.apiKey.count({
        where: { id: { in: pointerIds } },
      });
    }

    recordGauge(`${METRIC_PREFIX}.orphaned_mcp_api_keys`, liveKeys, {
      kind: "live_key",
    });
    recordGauge(
      `${METRIC_PREFIX}.orphaned_mcp_api_keys`,
      pointerIds.length - liveKeys,
      { kind: "stuck_pointer" },
    );
  }
}

function staleRunWhere(now: number): Prisma.InAppAgentRunWhereInput {
  const queueCutoff = new Date(now - IN_APP_AGENT_QUEUE_TIMEOUT_MS);
  const durationCutoff = new Date(now - IN_APP_AGENT_RUN_MAX_DURATION_MS);
  const heartbeatCutoff = new Date(now - IN_APP_AGENT_HEARTBEAT_STALE_MS);
  const approvalCutoff = new Date(now - IN_APP_AGENT_APPROVAL_TTL_MS);

  return {
    OR: [
      {
        status: InAppAgentRunStatus.QUEUED,
        createdAt: { lt: queueCutoff },
      },
      {
        status: InAppAgentRunStatus.RUNNING,
        OR: [
          { claimedAt: { lt: durationCutoff } },
          { claimedAt: null, createdAt: { lt: durationCutoff } },
          { heartbeatAt: { lt: heartbeatCutoff } },
          { heartbeatAt: null, claimedAt: { lt: heartbeatCutoff } },
          {
            heartbeatAt: null,
            claimedAt: null,
            createdAt: { lt: heartbeatCutoff },
          },
        ],
      },
      {
        status: InAppAgentRunStatus.AWAITING_APPROVAL,
        finishedAt: { lt: approvalCutoff },
      },
    ],
  };
}
