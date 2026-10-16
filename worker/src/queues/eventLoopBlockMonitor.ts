import { logger, recordDistribution } from "@langfuse/shared/src/server";
import { WORKER_HOST_ID } from "../utils/hostId";

/**
 * Attributes event-loop blocks to the queue jobs that were active while the
 * loop was blocked. Datadog's runtime metrics show *that* a task froze; this
 * says which queue, job and project were running at the time. A block longer
 * than BullMQ's lock renewal (15s by default) lets the job's lock expire, so
 * another worker re-runs it as "stalled" and freezes in turn.
 *
 * One process-wide timer detects blocks (tick drift). Every job active during
 * the blocked window is a candidate: with concurrency > 1 the culprit is not
 * certain, but the longest-running candidate on a recurring block usually is.
 */
const TICK_MS = 500;
/** Blocks at or above this are counted in metrics. */
export const EVENT_LOOP_BLOCK_METRIC_MIN_MS = 1_000;
/** Blocks at or above this are logged with their candidate jobs. */
export const EVENT_LOOP_BLOCK_LOG_MIN_MS = 5_000;
const MAX_LOGGED_JOBS = 20;
const PROCESS_METRIC = "langfuse.worker.event_loop_blocked_ms";

export type TrackedQueueJob = {
  queueName: string;
  /** Per-queue metric prefix, e.g. `langfuse.queue.topics_update`. */
  baseMetric: string;
  shardTag?: { shard: string };
  jobId?: string;
  jobName?: string;
  projectId?: string;
};

type TrackedEntry = TrackedQueueJob & {
  startedAt: number;
  finishedAt?: number;
};

export class EventLoopBlockMonitor {
  private readonly jobs = new Set<TrackedEntry>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastTick = 0;

  constructor(
    private readonly now: () => number = () => performance.now(),
    private readonly hostId: string = WORKER_HOST_ID,
  ) {}

  start(): void {
    if (this.timer) return;
    this.lastTick = this.now();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.jobs.clear();
  }

  /** Registers a running job; call the returned function when it settles. */
  track(job: TrackedQueueJob): () => void {
    if (!this.timer) return () => {};
    const entry: TrackedEntry = { ...job, startedAt: this.now() };
    this.jobs.add(entry);
    return () => {
      // Kept until the next tick: a job whose own synchronous work blocked the
      // loop usually settles before the tick that detects the block.
      entry.finishedAt = this.now();
    };
  }

  /** Runs on every interval; public so tests can drive it with a fake clock. */
  tick(): void {
    const now = this.now();
    const blockedMs = now - this.lastTick - TICK_MS;
    if (blockedMs >= EVENT_LOOP_BLOCK_METRIC_MIN_MS)
      this.report(blockedMs, now);
    this.lastTick = now;
    for (const entry of this.jobs)
      if (entry.finishedAt !== undefined) this.jobs.delete(entry);
  }

  private report(blockedMs: number, now: number): void {
    // Every tracked entry overlaps the blocked window: finished entries are
    // dropped on each tick, so the rest settled after the previous tick.
    const candidates = [...this.jobs]
      .map((entry) => ({
        entry,
        runningMs: (entry.finishedAt ?? now) - entry.startedAt,
      }))
      .sort((a, b) => b.runningMs - a.runningMs);
    const unit = { unit: "milliseconds" };
    recordDistribution(PROCESS_METRIC, blockedMs, {
      ...unit,
      attributed: candidates.length ? "true" : "false",
    });
    const queues = new Map<string, TrackedEntry>();
    for (const { entry } of candidates)
      if (!queues.has(entry.queueName)) queues.set(entry.queueName, entry);
    for (const entry of queues.values())
      recordDistribution(
        `${entry.baseMetric}.event_loop_blocked_ms`,
        blockedMs,
        {
          ...unit,
          ...entry.shardTag,
        },
      );

    if (blockedMs < EVENT_LOOP_BLOCK_LOG_MIN_MS) return;
    const top = candidates[0];
    const summary = top
      ? `; longest-running active job: ${top.entry.queueName}/${top.entry.jobId ?? "unknown"} projectId=${top.entry.projectId ?? "unknown"} runningMs=${Math.round(top.runningMs)}`
      : "; no queue job was active";
    logger.warn(
      `Event loop blocked for ${Math.round(blockedMs)}ms on host ${this.hostId}${summary}`,
      {
        blockedMs: Math.round(blockedMs),
        hostId: this.hostId,
        activeJobCount: candidates.length,
        activeQueues: [...queues.keys()],
        // Logged as an attribute so the culprit is a Datadog facet.
        topQueue: top?.entry.queueName,
        topJobId: top?.entry.jobId,
        topProjectId: top?.entry.projectId,
        jobs: candidates
          .slice(0, MAX_LOGGED_JOBS)
          .map(({ entry, runningMs }) => ({
            queue: entry.queueName,
            jobId: entry.jobId,
            jobName: entry.jobName,
            projectId: entry.projectId,
            runningMs: Math.round(runningMs),
            finished: entry.finishedAt !== undefined,
          })),
      },
    );
  }
}

export const eventLoopBlockMonitor = new EventLoopBlockMonitor();
