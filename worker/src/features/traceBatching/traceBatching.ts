import { createHash } from "node:crypto";
import {
  logger,
  getCurrentSpan,
  QueueJobs,
  redis,
  recordDistribution,
  recordGauge,
  recordIncrement,
  TraceBatchTraceSchema,
  EventsDispatchQueue,
} from "@langfuse/shared/src/server";
import { env } from "../../env";
import { PeriodicExclusiveRunner } from "../../utils/PeriodicExclusiveRunner";
import {
  CLEANUP_SIZE,
  evalReadiness,
  getTraceBatchShard,
  SNAPSHOT_SCRIPT,
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
  ACKNOWLEDGE_RECORDING_SCRIPT,
  evalRecording,
  getRecordingBoundsKey,
  getRecordingKeys,
  HYDRATE_RECORDING_SCRIPT,
} from "./traceRuleRecording";
import {
  isEventsDispatchEnabled,
  traceDispatchConfig,
  eventsDispatchConfig,
} from "../eventsDispatch/config";

const CHUNK_SIZE = 1_000;
// Per-shard/run candidate cap; excess stays due for the next run.
const DISPATCH_CANDIDATE_LIMIT = 10_000;
const REDIS_CHUNK_SIZE = 50;

export class TraceBatchDispatcher extends PeriodicExclusiveRunner {
  private stopping = false;
  private activeDispatch: Promise<void> | null = null;

  constructor() {
    super({
      name: "TraceBatchDispatcher",
      metricName: "trace_batch_dispatcher",
      lockKey: "{trace-dispatch}:dispatcher",
      lockTtlSeconds: 60,
      onUnavailable: "fail",
    });
  }

  protected get defaultIntervalMs(): number {
    return traceDispatchConfig.dispatchIntervalMs;
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
    if (!isEventsDispatchEnabled() || this.stopping || this.activeDispatch)
      return;
    const startedAt = Date.now();
    const dispatch = this.withLock(async () => {
      const counts = { fetched: 0, hydrated: 0, enqueued: 0 };
      try {
        await this.dispatchDue(counts);
      } finally {
        for (const [stage, count] of Object.entries(counts)) {
          recordDistribution(
            "langfuse.trace_dispatch.dispatcher_traces",
            count,
            {
              stage,
            },
          );
          getCurrentSpan()?.setAttribute(
            `trace_dispatch.${stage}_traces`,
            count,
          );
        }
      }
    }).then(() => {});
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

  private async dispatchDue(counts: {
    fetched: number;
    hydrated: number;
    enqueued: number;
  }): Promise<void> {
    if (!redis) throw new Error("Trace batching requires Redis");
    const queue = EventsDispatchQueue.getInstance();
    if (!queue) throw new Error("Events dispatch queue is unavailable");
    const getKeys = (shard: number) => {
      const { due, pending } = getRecordingKeys(shard);
      return { due, state: pending };
    };
    const totals = { pending: 0, ready: 0, oldestAge: 0 };
    const members: {
      member: string;
      projectId: string;
      shard: number;
      cutoff: string;
      due: number;
    }[] = [];
    for (let shard = 0; shard < traceDispatchConfig.shardCount; shard++) {
      if (this.stopping) return;
      const { due, state } = getKeys(shard);
      let cutoff = "";
      let now = 0;
      while (!this.stopping) {
        await this.extendLockOnProgress();
        const snapshot = (await evalReadiness(
          SNAPSHOT_SCRIPT,
          [due, state],
          [traceDispatchConfig.pendingTtlMs, cutoff],
        )) as (string | number)[];
        const [clock, , pending, ready, oldest, expired] = snapshot.map(Number);
        now = clock;
        cutoff = String(snapshot[1]);
        recordIncrement("langfuse.trace_dispatch.expired_traces", expired, {
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
      const from = `(${now - traceDispatchConfig.pendingTtlMs}`;
      const dueMembers = await redis.zrange(
        due,
        from,
        cutoff,
        "BYSCORE",
        "LIMIT",
        0,
        DISPATCH_CANDIDATE_LIMIT,
        "WITHSCORES",
      );
      counts.fetched += dueMembers.length / 2;
      recordDistribution(
        "langfuse.trace_dispatch.snapshot_size",
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
    recordGauge("langfuse.trace_dispatch.pending_traces", totals.pending);
    recordGauge("langfuse.trace_dispatch.ready_traces", totals.ready);
    recordGauge("langfuse.trace_dispatch.oldest_due_age_ms", totals.oldestAge);
    if (this.stopping) return;

    // Each range read captures one shard's due IDs. Pack the combined cohort so
    // Redis placement does not determine the ClickHouse query boundaries.
    // Keep each project's due traces together across shards so they share hydration windows.
    members.sort(
      (a, b) =>
        compareStrings(a.projectId, b.projectId) ||
        compareNumbers(a.due, b.due) ||
        compareStrings(a.member, b.member),
    );
    const batchWeightLimits: TraceBatchWeightLimits = {
      maxSerializedEventBytes: toLimit(eventsDispatchConfig.maxBatchBytes),
    };
    const traceWeightLimits: TraceBatchWeightLimits = {
      maxSerializedEventBytes: toLimit(eventsDispatchConfig.maxTraceBytes),
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
        const { due, state } = getKeys(shard);
        for (
          let offset = 0;
          offset < group.length;
          offset += REDIS_CHUNK_SIZE
        ) {
          const chunk = group.slice(offset, offset + REDIS_CHUNK_SIZE);
          const flags = (await evalRecording(
            ACKNOWLEDGE_RECORDING_SCRIPT,
            [due, state],
            chunk.flatMap(({ entry: { member, trace } }) => [
              member,
              trace.revision,
            ]),
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
        "langfuse.trace_dispatch.reactivated_traces",
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
        recordIncrement("langfuse.trace_dispatch.excluded_traces", 1, {
          reason,
        });
        logger.warn("Trace batch excluded trace", {
          projectId: entry.trace.projectId,
          traceId: entry.trace.traceId,
          reason,
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
        QueueJobs.EventsDispatchJob,
        {
          id,
          timestamp: new Date(),
          name: QueueJobs.EventsDispatchJob,
          payload: { traces },
        },
        { jobId: id },
      );
      enqueued.push(...batch);
      counts.enqueued += batch.length;
      recordDistribution("langfuse.events_dispatch.batch_size", batch.length);
      recordDistribution(
        "langfuse.events_dispatch.batch_project_count",
        new Set(traces.map((trace) => trace.projectId)).size,
      );
      const fill = (() => {
        if (batch.length === 1) {
          return "singleton";
        }
        if (batch.length === env.LANGFUSE_EVENTS_DISPATCH_MAX_BATCH_SIZE) {
          return "full";
        }
        return "partial";
      })();
      recordIncrement("langfuse.events_dispatch.dispatched_batches", 1, {
        fill,
      });
      recordDistribution(
        "langfuse.events_dispatch.event_time_envelope_ms",
        Math.max(...traces.map(({ maxStart }) => maxStart)) -
          Math.min(...traces.map(({ minStart }) => minStart)) +
          2 * QUERY_BUFFER_MS,
      );
      let estimatedSerializedEventBytes = 0;
      let unavailableEstimates = 0;
      for (const entry of batch) {
        if (entry.estimates) {
          estimatedSerializedEventBytes += entry.estimates.serializedEventBytes;
          recordDistribution(
            "langfuse.events_dispatch.estimated_serialized_event_bytes",
            entry.estimates.serializedEventBytes,
            { scope: "trace" },
          );
        } else {
          unavailableEstimates++;
        }
      }
      if (unavailableEstimates === 0) {
        recordDistribution(
          "langfuse.events_dispatch.estimated_serialized_event_bytes",
          estimatedSerializedEventBytes,
          { scope: "batch" },
        );
      } else {
        recordIncrement(
          "langfuse.events_dispatch.estimates_unavailable",
          unavailableEstimates,
          {
            scope: "trace",
          },
        );
        recordIncrement("langfuse.events_dispatch.estimates_unavailable", 1, {
          scope: "batch",
        });
      }
    };

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
        const { due, state } = getKeys(shard);
        for (let start = 0; start < group.length; start += REDIS_CHUNK_SIZE) {
          await this.extendLockOnProgress();
          const chunk = group.slice(start, start + REDIS_CHUNK_SIZE);
          const args = [group[0].cutoff, traceDispatchConfig.pendingTtlMs];
          const part = (await evalRecording(
            HYDRATE_RECORDING_SCRIPT,
            [
              due,
              state,
              ...chunk.map(({ member }) =>
                getRecordingBoundsKey(shard, member),
              ),
            ],
            [...args, ...chunk.map(({ member }) => member)],
          )) as string[];
          counts.hydrated += part.length / 3;
          for (let index = 0; index < part.length; index += 3) {
            hydratedByMember.set(part[index], [
              part[index + 1],
              part[index + 2],
            ]);
          }
        }
      }
      recordIncrement(
        "langfuse.trace_dispatch.skipped_traces",
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
            Number.isSafeInteger(state.serializedEventBytes) &&
            state.serializedEventBytes >= 0
              ? { serializedEventBytes: state.serializedEventBytes }
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

      const carriedTraceCount = localityPartials.reduce(
        (count, batch) => count + batch.length,
        0,
      );
      const selectorInput = [...localityPartials.flat(), ...hydratedCandidates];
      recordDistribution(
        "langfuse.trace_dispatch.candidate_buffer_size",
        hydratedCandidates.length + carriedTraceCount,
      );
      const selectorStartedAt = performance.now();
      const selected = selectTraceBatches(
        selectorInput,
        env.LANGFUSE_EVENTS_DISPATCH_MAX_BATCH_SIZE,
        batchWeightLimits,
      );
      recordDistribution(
        "langfuse.trace_dispatch.selector_duration_ms",
        performance.now() - selectorStartedAt,
      );

      try {
        const fullBatches = selected.filter(
          (batch) =>
            batch.length === env.LANGFUSE_EVENTS_DISPATCH_MAX_BATCH_SIZE,
        );
        const partialBatches = selected.filter(
          (batch) => batch.length < env.LANGFUSE_EVENTS_DISPATCH_MAX_BATCH_SIZE,
        );
        for (const batch of fullBatches) {
          if (this.stopping) return;
          await enqueue(batch);
        }
        await this.extendLockOnProgress();
        if (this.stopping) return;
        const prepared = prepareLocalityPartials(
          partialBatches,
          env.LANGFUSE_EVENTS_DISPATCH_MAX_BATCH_SIZE,
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
