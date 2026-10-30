import { createHash, randomUUID } from "node:crypto";
import {
  getTracingReadinessSettings,
  logger,
  QueueJobs,
  redis,
  recordDistribution,
  recordGauge,
  recordIncrement,
  TraceBatchTraceSchema,
  TraceBatchQueue,
} from "@langfuse/shared/src/server";
import {
  isTopicsProcessingActive,
  isTopicsProjectEnabled,
} from "@langfuse/shared/topics/server";
import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";
import {
  ACKNOWLEDGE_SCRIPT,
  CLEANUP_SIZE,
  evalReadiness,
  getTraceBatchFirstKeys,
  getTraceBatchFirstMember,
  getTraceBatchReadinessKeys,
  getTraceBatchShard,
  HYDRATE_SCRIPT,
  readinessScriptHashes,
  SNAPSHOT_SCRIPT,
  TRACK_SCRIPT,
} from "./traceBatchReadiness";
import {
  compareBatchesByOldestDue,
  compareNumbers,
  compareStrings,
  getTraceExclusionReason,
  type PendingTrace,
  prepareLocalityPartials,
  QUERY_BUFFER_MS,
  selectTraceBatches,
  toLimit,
  type TraceBatchWeightLimits,
  type TraceExclusionReason,
} from "./traceBatchSelection";
import {
  getDeterministicSamplingValue,
  shouldSampleEvaluation,
} from "../evaluation/deterministicSampling";

const CHUNK_SIZE = 1_000;
const REDIS_CHUNK_SIZE = 50;
const REDIS_PIPELINE_SIZE = 4;

function recordTrackingVolume(
  stage: "eligible" | "recorded",
  entries: Iterable<
    readonly [
      string,
      { eventUpdateCount: number; serializedEventBytes: number },
    ]
  >,
): void {
  let updates = 0;
  let bytes = 0;
  for (const [, state] of entries) {
    updates += state.eventUpdateCount;
    bytes += state.serializedEventBytes;
  }
  recordIncrement("langfuse.trace_batch.event_updates", updates, { stage });
  recordIncrement("langfuse.trace_batch.serialized_event_bytes", bytes, {
    stage,
  });
}

export async function trackTraceBatchActivity(
  projectId: string,
  events: {
    traceId: string;
    startTimeISO: string;
    serializedEventBytes: number;
  }[],
  idleMs?: number,
): Promise<void> {
  if (
    !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ||
    env.LANGFUSE_TRACE_BATCH_INGESTION_ENABLED !== "true"
  )
    return;
  const samplingRate = env.LANGFUSE_TRACE_BATCH_SAMPLING_RATE;
  // Topics summarizes every trace of an active project, so those bypass sampling.
  const topicsProject = await resolveTopicsProcessingActive(projectId);
  // Rate 0 admits only Topics projects; skip all tracking work for the rest.
  if (samplingRate === 0 && !topicsProject) return;

  const bounds = new Map<
    string,
    {
      minStart: number;
      maxStart: number;
      eventUpdateCount: number;
      serializedEventBytes: number;
    }
  >();
  for (const event of events) {
    const start = Date.parse(event.startTimeISO);
    if (!Number.isFinite(start)) continue;
    const previous = bounds.get(event.traceId);
    bounds.set(event.traceId, {
      minStart: Math.min(previous?.minStart ?? start, start),
      maxStart: Math.max(previous?.maxStart ?? start, start),
      eventUpdateCount: (previous?.eventUpdateCount ?? 0) + 1,
      serializedEventBytes:
        (previous?.serializedEventBytes ?? 0) + event.serializedEventBytes,
    });
  }
  if (bounds.size === 0) return;

  try {
    recordTrackingVolume("eligible", bounds);
    const admitAll = samplingRate === 1 || topicsProject;
    // Sample by trace ID so later observations and retries keep the same decision.
    // Dispatcher and consumer process admitted work without resampling.
    const entries = [...bounds].filter(
      ([traceId]) =>
        admitAll ||
        shouldSampleEvaluation({
          samplingValue: getDeterministicSamplingValue(traceId),
          samplingRate,
        }),
    );
    // Counts distinct trace IDs per ingestion batch, not globally unique traces.
    recordIncrement("langfuse.trace_batch.sampling_decisions", entries.length, {
      decision: "selected",
    });
    recordIncrement(
      "langfuse.trace_batch.sampling_decisions",
      bounds.size - entries.length,
      { decision: "excluded" },
    );
    if (entries.length === 0) return;
    const effectiveIdleMs = idleMs ?? (await resolveTraceIdleMs(projectId));
    if (!Number.isSafeInteger(effectiveIdleMs) || effectiveIdleMs <= 0)
      throw new Error("Trace batch idle time must be a positive integer");
    if (!redis) throw new Error("Trace batching requires Redis");
    const shards = new Map<number, typeof entries>();
    for (const entry of entries) {
      const shard = getTraceBatchShard(JSON.stringify([projectId, entry[0]]));
      const group = shards.get(shard) ?? [];
      group.push(entry);
      shards.set(shard, group);
    }
    const clock = await redis.time();
    const now = Number(clock[0]) * 1_000 + Math.floor(Number(clock[1]) / 1_000);
    // Each pipeline contains bounded scripts from one cluster slot.
    for (const [shard, group] of shards) {
      const { due, state: stateKey } = getTraceBatchReadinessKeys(shard);
      const first = getTraceBatchFirstKeys(shard, now);
      const keys = [due, stateKey, ...first.keys];
      for (
        let offset = 0;
        offset < group.length;
        offset += REDIS_CHUNK_SIZE * REDIS_PIPELINE_SIZE
      ) {
        const pipeline =
          group.length - offset > REDIS_CHUNK_SIZE
            ? redis.pipeline()
            : undefined;
        const commands: {
          chunk: typeof entries;
          args: (string | number | Buffer)[];
        }[] = [];
        for (
          let start = offset;
          start <
          Math.min(
            group.length,
            offset + REDIS_CHUNK_SIZE * REDIS_PIPELINE_SIZE,
          );
          start += REDIS_CHUNK_SIZE
        ) {
          const chunk = group.slice(start, start + REDIS_CHUNK_SIZE);
          const args = [
            effectiveIdleMs,
            env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS,
            env.LANGFUSE_TRACE_BATCH_FIRST_SEEN_TTL_MS,
            first.width,
            first.firstBucket,
            ...chunk.flatMap(([traceId, state]) => [
              JSON.stringify([projectId, traceId]),
              state.minStart,
              state.maxStart,
              // Unique even after dispatch deletes and a later arrival recreates state.
              randomUUID(),
              state.eventUpdateCount,
              state.serializedEventBytes,
              getTraceBatchFirstMember(JSON.stringify([projectId, traceId])),
            ]),
          ];
          pipeline?.evalsha(
            readinessScriptHashes.get(TRACK_SCRIPT)!,
            keys.length,
            ...keys,
            ...args,
          );
          commands.push({ chunk, args });
        }
        const results: [Error | null, unknown][] | null = pipeline
          ? await pipeline.exec()
          : [[null, await evalReadiness(TRACK_SCRIPT, keys, commands[0].args)]];
        if (!results)
          throw new Error("Trace batch tracking pipeline returned no results");
        let failure: unknown;
        // A command error does not undo successful siblings. Record every known result.
        for (const [index, { chunk, args }] of commands.entries()) {
          try {
            const [error, result] = results[index];
            let expired: number;
            if (error) {
              if (!error.message.startsWith("NOSCRIPT")) throw error;
              // Only this cache miss is safe to retry; successful siblings are not replayed.
              expired = Number(
                await redis.eval(TRACK_SCRIPT, keys.length, ...keys, ...args),
              );
            } else {
              expired = Number(result);
            }
            recordTrackingVolume("recorded", chunk);
            recordIncrement("langfuse.trace_batch.expired_traces", expired, {
              source: "ingestion",
            });
            recordIncrement(
              "langfuse.trace_batch.tracked_traces",
              chunk.length,
            );
          } catch (error) {
            if (failure === undefined) failure = error;
          }
        }
        if (failure !== undefined) throw failure;
      }
    }
  } catch (error) {
    // This optional load experiment must not fail normal event ingestion.
    recordIncrement("langfuse.trace_batch.tracking_errors", 1);
    logger.error("Failed to track trace batch activity", { error });
  }
}

async function resolveTopicsProcessingActive(
  projectId: string,
): Promise<boolean> {
  try {
    return await isTopicsProcessingActive(projectId);
  } catch (error) {
    // The allowlist keeps Topics traces during an outage; the consumer still
    // loads each project's models and skips projects without them.
    recordIncrement("langfuse.trace_batch.topics_gate_failures", 1);
    logger.warn("Failed to read Topics processing state, using allowlist", {
      projectId,
      error,
    });
    return isTopicsProjectEnabled(projectId);
  }
}

async function resolveTraceIdleMs(projectId: string): Promise<number> {
  let traceIdleMs: number | null = null;
  try {
    ({ traceIdleMs } = await getTracingReadinessSettings(projectId));
  } catch (error) {
    recordIncrement("langfuse.trace_batch.idle_time_read_failures", 1);
    logger.warn("Failed to read trace idle time, using the default", {
      projectId,
      error,
    });
  }
  if (traceIdleMs === null) return env.LANGFUSE_TRACE_BATCH_IDLE_MS;
  // A due time past the pending TTL would expire the trace before dispatch.
  const cap =
    env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS -
    env.LANGFUSE_TRACE_BATCH_DISPATCH_INTERVAL_MS;
  return cap > 0 ? Math.min(traceIdleMs, cap) : traceIdleMs;
}

export class TraceBatchDispatcher extends PeriodicExclusiveRunner {
  private stopping = false;
  private activeDispatch: Promise<void> | null = null;

  constructor() {
    super({
      name: "TraceBatchDispatcher",
      metricName: "trace_batch_dispatcher",
      lockKey: "{trace-batch}:dispatcher",
      lockTtlSeconds: 60,
      onUnavailable: "fail",
    });
  }

  protected get defaultIntervalMs(): number {
    return env.LANGFUSE_TRACE_BATCH_DISPATCH_INTERVAL_MS;
  }

  public override stop(): void {
    this.stopping = true;
    super.stop();
  }

  public async drain(): Promise<void> {
    this.stop();
    if (!this.activeDispatch) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.activeDispatch,
        new Promise<void>((resolve) => {
          timeout = setTimeout(() => {
            logger.warn(
              "Trace batch dispatcher drain timed out after 5 seconds; continuing shutdown",
            );
            resolve();
          }, 5_000);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  protected async execute(): Promise<number | void> {
    if (
      !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ||
      env.LANGFUSE_TRACE_BATCH_DISPATCHER_ENABLED !== "true" ||
      this.stopping ||
      this.activeDispatch
    )
      return;
    const startedAt = Date.now();
    const dispatch = this.withLock(() => this.dispatchDue()).then(() => {});
    this.activeDispatch = dispatch;
    try {
      await dispatch;
    } finally {
      this.activeDispatch = null;
    }
    // PeriodicRunner waits this delay after completion. Account for work time
    // to maintain the configured start cadence without overlapping runs.
    return Math.max(0, this.defaultIntervalMs - (Date.now() - startedAt));
  }

  private async dispatchDue(): Promise<void> {
    if (!redis) throw new Error("Trace batching requires Redis");
    const queue = TraceBatchQueue.getInstance();
    if (!queue) throw new Error("Trace batch queue is unavailable");
    const totals = { pending: 0, ready: 0, oldestAge: 0 };
    const members: {
      member: string;
      projectId: string;
      shard: number;
      cutoff: string;
      due: number;
    }[] = [];
    for (let shard = 0; shard < env.LANGFUSE_TRACE_BATCH_SHARD_COUNT; shard++) {
      if (this.stopping) return;
      const { due, state } = getTraceBatchReadinessKeys(shard);
      let cutoff = "";
      let now = 0;
      while (!this.stopping) {
        await this.extendLockOnProgress();
        const snapshot = (await evalReadiness(
          SNAPSHOT_SCRIPT,
          [due, state],
          [env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS, cutoff],
        )) as (string | number)[];
        const [clock, , pending, ready, oldest, expired] = snapshot.map(Number);
        now = clock;
        cutoff = String(snapshot[1]);
        recordIncrement("langfuse.trace_batch.expired_traces", expired, {
          source: "dispatcher",
        });
        if (expired < CLEANUP_SIZE) {
          totals.pending += pending;
          totals.ready += ready;
          totals.oldestAge = Math.max(
            totals.oldestAge,
            Math.max(0, now - oldest),
          );
          break;
        }
      }
      if (this.stopping) return;
      const dueMembers = await redis.zrange(
        due,
        `(${now - env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS}`,
        cutoff,
        "BYSCORE",
        "WITHSCORES",
      );
      recordDistribution(
        "langfuse.trace_batch.snapshot_size",
        dueMembers.length / 2,
      );
      for (let index = 0; index < dueMembers.length; index += 2) {
        const member = dueMembers[index];
        members.push({
          member,
          projectId: (JSON.parse(member) as [string, string])[0],
          shard,
          cutoff,
          due: Number(dueMembers[index + 1]),
        });
      }
    }
    // The lease moves between workers after every run, so per-shard series
    // would multiply custom metrics by the shard count on each dispatcher.
    recordGauge("langfuse.trace_batch.pending_traces", totals.pending);
    recordGauge("langfuse.trace_batch.ready_traces", totals.ready);
    recordGauge("langfuse.trace_batch.oldest_due_age_ms", totals.oldestAge);
    if (this.stopping) return;

    // Each range read captures one shard's due IDs. Pack the combined cohort so
    // Redis placement does not determine the ClickHouse query boundaries.
    const strategy = env.LANGFUSE_TRACE_BATCH_STRATEGY;
    // Project packing needs due order within each project, including across shards.
    members.sort(
      (a, b) =>
        compareStrings(a.projectId, b.projectId) ||
        compareNumbers(a.due, b.due) ||
        compareStrings(a.member, b.member),
    );
    const batchWeightLimits: TraceBatchWeightLimits = {
      maxEventUpdates: toLimit(
        env.LANGFUSE_TRACE_BATCH_MAX_BATCH_EVENT_UPDATES,
      ),
      maxSerializedEventBytes: toLimit(
        env.LANGFUSE_TRACE_BATCH_MAX_BATCH_SERIALIZED_BYTES,
      ),
    };
    const traceWeightLimits: TraceBatchWeightLimits = {
      maxEventUpdates: toLimit(
        env.LANGFUSE_TRACE_BATCH_MAX_TRACE_EVENT_UPDATES,
      ),
      maxSerializedEventBytes: toLimit(
        env.LANGFUSE_TRACE_BATCH_MAX_TRACE_SERIALIZED_BYTES,
      ),
    };

    const acknowledge = async (
      batch: readonly PendingTrace[],
    ): Promise<boolean[]> => {
      const removed = Array<boolean>(batch.length).fill(false);
      const groups = new Map<
        number,
        { entry: PendingTrace; index: number }[]
      >();
      batch.forEach((entry, index) => {
        const shard = getTraceBatchShard(entry.member);
        const group = groups.get(shard) ?? [];
        group.push({ entry, index });
        groups.set(shard, group);
      });
      for (const [shard, group] of groups) {
        const { due, state } = getTraceBatchReadinessKeys(shard);
        for (
          let offset = 0;
          offset < group.length;
          offset += REDIS_CHUNK_SIZE
        ) {
          const chunk = group.slice(offset, offset + REDIS_CHUNK_SIZE);
          const clock = await redis!.time();
          const first = getTraceBatchFirstKeys(
            shard,
            Number(clock[0]) * 1_000 + Math.floor(Number(clock[1]) / 1_000),
          );
          const flags = (await evalReadiness(
            ACKNOWLEDGE_SCRIPT,
            [due, state, ...first.keys],
            [
              env.LANGFUSE_TRACE_BATCH_FIRST_SEEN_TTL_MS,
              first.width,
              first.firstBucket,
              ...chunk.flatMap(({ entry: { member, trace } }) => [
                member,
                trace.revision,
                getTraceBatchFirstMember(member),
              ]),
            ],
          )) as number[];
          chunk.forEach(({ index }, position) => {
            removed[index] = Number(flags[position]) === 1;
          });
        }
      }
      return removed;
    };

    const enqueued: PendingTrace[] = [];
    const flushEnqueued = async () => {
      if (enqueued.length === 0) return;
      const removed = await acknowledge(enqueued.splice(0));
      recordIncrement(
        "langfuse.trace_batch.reactivated_traces",
        removed.filter((wasRemoved) => !wasRemoved).length,
      );
    };

    // Excluded traces leave Redis like dispatched ones; activity after this
    // run's snapshot starts a fresh pending window that is evaluated again.
    // A trace whose revision changed before acknowledgement stays pending and
    // is reported only once a later run removes it.
    const exclude = async (
      excluded: readonly {
        entry: PendingTrace;
        reason: TraceExclusionReason;
      }[],
    ) => {
      if (excluded.length === 0) return;
      await this.extendLockOnProgress(true);
      if (this.stopping) return;
      const removed = await acknowledge(excluded.map(({ entry }) => entry));
      for (const [index, { entry, reason }] of excluded.entries()) {
        if (!removed[index]) continue;
        recordIncrement("langfuse.trace_batch.excluded_traces", 1, {
          reason,
          strategy,
        });
        logger.warn("Trace batch excluded oversized trace", {
          projectId: entry.trace.projectId,
          traceId: entry.trace.traceId,
          reason,
          estimatedEventUpdateCount: entry.estimates?.eventUpdateCount,
          estimatedSerializedEventBytes: entry.estimates?.serializedEventBytes,
          eventTimeEnvelopeMs: entry.trace.maxStart - entry.trace.minStart,
        });
      }
    };

    const enqueue = async (batch: PendingTrace[]) => {
      await this.extendLockOnProgress(true);
      if (this.stopping) return;
      const traces = batch.map(({ trace }) => trace);
      const id = createHash("sha256")
        .update(JSON.stringify(traces))
        .digest("hex");
      // Stable IDs reduce duplicate delivery if enqueue succeeds but ACK fails.
      // Reads remain retry-safe even if regrouping produces a different job ID.
      await queue.add(
        QueueJobs.TraceBatch,
        {
          id,
          timestamp: new Date(),
          name: QueueJobs.TraceBatch,
          payload: { traces },
        },
        { jobId: id },
      );
      enqueued.push(...batch);
      recordDistribution("langfuse.trace_batch.size", batch.length);
      recordDistribution(
        "langfuse.trace_batch.project_count",
        new Set(traces.map((trace) => trace.projectId)).size,
      );
      const fill = (() => {
        if (batch.length === 1) {
          return "singleton";
        }
        if (batch.length === env.LANGFUSE_TRACE_BATCH_MAX_SIZE) {
          return "full";
        }
        return "partial";
      })();
      recordIncrement("langfuse.trace_batch.dispatched_batches", 1, {
        strategy,
        fill,
      });
      recordDistribution(
        "langfuse.trace_batch.event_time_envelope_ms",
        Math.max(...traces.map(({ maxStart }) => maxStart)) -
          Math.min(...traces.map(({ minStart }) => minStart)) +
          2 * QUERY_BUFFER_MS,
        { strategy },
      );
      let estimatedEventUpdateCount = 0;
      let estimatedSerializedEventBytes = 0;
      let unavailableEstimates = 0;
      for (const entry of batch) {
        if (entry.estimates) {
          estimatedEventUpdateCount += entry.estimates.eventUpdateCount;
          estimatedSerializedEventBytes += entry.estimates.serializedEventBytes;
          recordDistribution(
            "langfuse.trace_batch.estimated_event_update_count",
            entry.estimates.eventUpdateCount,
            { scope: "trace", strategy },
          );
          recordDistribution(
            "langfuse.trace_batch.estimated_serialized_event_bytes",
            entry.estimates.serializedEventBytes,
            { scope: "trace", strategy },
          );
        } else {
          unavailableEstimates++;
        }
      }
      if (unavailableEstimates === 0) {
        recordDistribution(
          "langfuse.trace_batch.estimated_event_update_count",
          estimatedEventUpdateCount,
          { scope: "batch", strategy },
        );
        recordDistribution(
          "langfuse.trace_batch.estimated_serialized_event_bytes",
          estimatedSerializedEventBytes,
          { scope: "batch", strategy },
        );
      } else {
        recordIncrement(
          "langfuse.trace_batch.estimates_unavailable",
          unavailableEstimates,
          {
            scope: "trace",
            strategy,
          },
        );
        recordIncrement("langfuse.trace_batch.estimates_unavailable", 1, {
          scope: "batch",
          strategy,
        });
      }
    };

    let projectBatchTail: PendingTrace[] = [];
    let localityPartials: PendingTrace[][] = [];
    for (
      let offset = 0;
      offset < members.length && !this.stopping;
      offset += CHUNK_SIZE
    ) {
      await this.extendLockOnProgress();
      const candidates = members.slice(offset, offset + CHUNK_SIZE);
      const byShard = new Map<number, typeof candidates>();
      for (const candidate of candidates) {
        const group = byShard.get(candidate.shard) ?? [];
        group.push(candidate);
        byShard.set(candidate.shard, group);
      }
      const hydratedByMember = new Map<string, [string, string]>();
      for (const [shard, group] of byShard) {
        const { due, state } = getTraceBatchReadinessKeys(shard);
        for (let start = 0; start < group.length; start += REDIS_CHUNK_SIZE) {
          await this.extendLockOnProgress();
          const part = (await evalReadiness(
            HYDRATE_SCRIPT,
            [due, state],
            [
              group[0].cutoff,
              env.LANGFUSE_TRACE_BATCH_PENDING_TTL_MS,
              ...group
                .slice(start, start + REDIS_CHUNK_SIZE)
                .map(({ member }) => member),
            ],
          )) as string[];
          for (let index = 0; index < part.length; index += 3) {
            hydratedByMember.set(part[index], [
              part[index + 1],
              part[index + 2],
            ]);
          }
        }
      }
      recordIncrement(
        "langfuse.trace_batch.skipped_traces",
        candidates.length - hydratedByMember.size,
      );
      const hydratedCandidates: PendingTrace[] = [];
      const excluded: {
        entry: PendingTrace;
        reason: TraceExclusionReason;
      }[] = [];
      for (const { member } of candidates) {
        if (this.stopping) return;
        const hydrated = hydratedByMember.get(member);
        if (!hydrated) continue;
        const [projectId, traceId] = JSON.parse(member) as [string, string];
        const state = JSON.parse(hydrated[0]);
        const entry: PendingTrace = {
          member,
          due: Number(hydrated[1]),
          estimates:
            Number.isSafeInteger(state.eventUpdateCount) &&
            state.eventUpdateCount >= 0 &&
            Number.isSafeInteger(state.serializedEventBytes) &&
            state.serializedEventBytes >= 0
              ? {
                  eventUpdateCount: state.eventUpdateCount,
                  serializedEventBytes: state.serializedEventBytes,
                }
              : undefined,
          trace: TraceBatchTraceSchema.parse({
            ...state,
            projectId,
            traceId,
          }),
        };
        const reason = getTraceExclusionReason(entry, traceWeightLimits);
        if (reason) excluded.push({ entry, reason });
        else hydratedCandidates.push(entry);
      }
      await exclude(excluded);
      if (this.stopping) return;

      const carriedTraceCount =
        strategy === "project"
          ? projectBatchTail.length
          : localityPartials.reduce((count, batch) => count + batch.length, 0);
      const selectorInput =
        strategy === "project"
          ? [...projectBatchTail, ...hydratedCandidates]
          : [...localityPartials.flat(), ...hydratedCandidates];
      recordDistribution(
        "langfuse.trace_batch.candidate_buffer_size",
        hydratedCandidates.length + carriedTraceCount,
        { strategy },
      );
      const selectorStartedAt = performance.now();
      const selected = selectTraceBatches(
        selectorInput,
        env.LANGFUSE_TRACE_BATCH_MAX_SIZE,
        strategy,
        batchWeightLimits,
      );
      recordDistribution(
        "langfuse.trace_batch.selector_duration_ms",
        performance.now() - selectorStartedAt,
        { strategy },
      );

      try {
        if (strategy === "project") {
          projectBatchTail = [];
          if (selected.at(-1)?.length !== env.LANGFUSE_TRACE_BATCH_MAX_SIZE) {
            projectBatchTail = selected.pop() ?? [];
          }
          for (const batch of selected) {
            if (this.stopping) return;
            await enqueue(batch);
          }
          continue;
        }

        const fullBatches = selected.filter(
          (batch) => batch.length === env.LANGFUSE_TRACE_BATCH_MAX_SIZE,
        );
        const partialBatches = selected.filter(
          (batch) => batch.length < env.LANGFUSE_TRACE_BATCH_MAX_SIZE,
        );
        for (const batch of fullBatches) {
          if (this.stopping) return;
          await enqueue(batch);
        }
        await this.extendLockOnProgress();
        if (this.stopping) return;
        const prepared = prepareLocalityPartials(
          partialBatches,
          env.LANGFUSE_TRACE_BATCH_MAX_SIZE,
          batchWeightLimits,
        );
        localityPartials = prepared.carry;
        for (const batch of prepared.dispatch) {
          if (this.stopping) return;
          await enqueue(batch);
        }
      } finally {
        await flushEnqueued();
      }
    }
    if (this.stopping) return;
    try {
      if (strategy === "project") {
        if (projectBatchTail.length > 0) await enqueue(projectBatchTail);
        return;
      }
      for (const batch of localityPartials.toSorted(
        compareBatchesByOldestDue,
      )) {
        if (this.stopping) return;
        await enqueue(batch);
      }
    } finally {
      await flushEnqueued();
    }
  }
}
