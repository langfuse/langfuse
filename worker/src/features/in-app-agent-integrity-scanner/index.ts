import { prisma } from "@langfuse/shared/src/db";
import { logger, recordGauge } from "@langfuse/shared/src/server";
import {
  InAppAgentRunErrorCode,
  InAppAgentRunStatus,
} from "@langfuse/shared/in-app-agent";
import { classifyStaleRun } from "@langfuse/shared/in-app-agent/server/runLifecycle";

import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";

const METRIC_PREFIX = "langfuse.in_app_agent";

export const IN_APP_AGENT_INTEGRITY_SCANNER_LOCK_KEY =
  "langfuse:in-app-agent-integrity-scanner";

// One elected reporter is enough, so the lease only has to outlive a scan.
const LOCK_TTL_SECONDS = 120;

// Bounds every query. Unsettled runs are a small working set; if we ever hit a
// cap the count is reported as a floor and logged rather than silently trimmed.
const SCAN_LIMIT = 5_000;

const UNSETTLED_STATUSES = [
  InAppAgentRunStatus.QUEUED,
  InAppAgentRunStatus.RUNNING,
  InAppAgentRunStatus.AWAITING_APPROVAL,
];

// Emitted at zero when healthy so the gauges never go absent, which would make
// a monitor read "no data" instead of "nothing wrong".
const REPORTED_FINDINGS = [
  InAppAgentRunErrorCode.QUEUE_TIMEOUT,
  InAppAgentRunErrorCode.WORKER_LOST,
  InAppAgentRunErrorCode.RUN_TIMEOUT,
  InAppAgentRunErrorCode.APPROVAL_EXPIRED,
];

/**
 * Reports in-app agent run lifecycle integrity. Strictly read-only.
 *
 * Reconciliation is read-triggered: `classifyStaleRun` only runs when someone
 * opens a conversation, starts a run, or attaches the watch stream. A run in a
 * conversation nobody reopens can therefore sit past every deadline forever,
 * holding a per-user concurrency slot, with no signal anywhere. This scanner
 * makes that population visible without changing it — it reuses the same
 * predicate so the counts cannot drift from what reconciliation would decide,
 * but it never writes. Repairing these rows is a separate decision.
 */
export class InAppAgentIntegrityScanner extends PeriodicExclusiveRunner {
  private readonly intervalMs: number;

  protected get defaultIntervalMs(): number {
    return this.intervalMs;
  }

  constructor(opts: { intervalMs?: number } = {}) {
    super({
      name: "InAppAgentIntegrityScanner",
      metricName: "in_app_agent_integrity_scanner",
      lockKey: IN_APP_AGENT_INTEGRITY_SCANNER_LOCK_KEY,
      lockTtlSeconds: LOCK_TTL_SECONDS,
      onUnavailable: "fail",
    });

    this.intervalMs =
      opts.intervalMs ??
      env.LANGFUSE_IN_APP_AGENT_INTEGRITY_SCANNER_INTERVAL_MS;
  }

  public override start(): void {
    logger.info(`Starting ${this.instanceName}`, {
      intervalMs: this.intervalMs,
    });
    super.start();
  }

  protected async execute(): Promise<number | void> {
    return await this.withLock(async () => {
      await this.reportUnsettledRuns();
      await this.reportOrphanedMcpApiKeys();
    });
  }

  /** Active-run depth plus how many are past a reconciliation deadline. */
  private async reportUnsettledRuns(): Promise<void> {
    const runs = await prisma.inAppAgentRun.findMany({
      where: { status: { in: UNSETTLED_STATUSES } },
      select: {
        status: true,
        createdAt: true,
        claimedAt: true,
        heartbeatAt: true,
        finishedAt: true,
      },
      take: SCAN_LIMIT,
    });

    if (runs.length === SCAN_LIMIT) {
      logger.warn(
        `${this.instanceName}: unsettled run scan hit its limit; counts are a floor`,
        { scanLimit: SCAN_LIMIT },
      );
    }

    const activeByStatus = new Map<string, number>(
      UNSETTLED_STATUSES.map((status) => [status, 0]),
    );
    const findings = new Map<string, number>(
      REPORTED_FINDINGS.map((code) => [code, 0]),
    );

    const now = Date.now();
    for (const run of runs) {
      if (run.status) {
        activeByStatus.set(
          run.status,
          (activeByStatus.get(run.status) ?? 0) + 1,
        );
      }

      const stale = classifyStaleRun(run, now);
      if (stale) {
        findings.set(stale.errorCode, (findings.get(stale.errorCode) ?? 0) + 1);
      }
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
        // A parked approval has finishedAt set but is unsettled, and its key is
        // still needed by the continuation run, so it is not a leak.
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
