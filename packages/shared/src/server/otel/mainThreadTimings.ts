import { AsyncLocalStorage } from "node:async_hooks";

type TimingTags = {
  media_path: "early" | "reference";
  media_presence: "present" | "absent" | "unknown";
};

type TimingContext = {
  tags?: TimingTags;
  durations: Map<string, number>;
  measuring: boolean;
};
const timings = new AsyncLocalStorage<TimingContext>();

/** Collect one sample per phase per early-media queue attempt, including failures. */
export async function withOtelMainThreadTimings<T>(
  work: () => Promise<T>,
  record: (name: string, value: number, tags: Record<string, string>) => void,
): Promise<T> {
  const context: TimingContext = { durations: new Map(), measuring: false };
  return timings.run(context, async () => {
    try {
      return await work();
    } finally {
      if (context.tags?.media_path === "early") {
        for (const [phase, durationMs] of context.durations) {
          record(
            "langfuse.ingestion.otel.main_thread_duration_ms",
            durationMs,
            {
              ...context.tags,
              phase,
            },
          );
        }
      }
    }
  });
}

export function setOtelMainThreadTimingTags(tags: TimingTags): void {
  const context = timings.getStore();
  if (context) context.tags = tags;
}

/**
 * Time ONLY the synchronous call. Never pass an async callback here. Native
 * dispatch callbacks may return a promise: await it outside this interval so
 * only input copying and dispatch are counted. Nested calls belong to the
 * outer coarse phase, avoiding double counting. On the reference path and
 * outside an early-media queue attempt, this is a passthrough with no timer.
 */
export function measureOtelMainThread<T>(phase: string, work: () => T): T {
  const context = timings.getStore();
  if (!context || context.tags?.media_path !== "early" || context.measuring)
    return work();
  const startedAt = performance.now();
  context.measuring = true;
  try {
    return work();
  } finally {
    const durationMs = performance.now() - startedAt;
    context.measuring = false;
    context.durations.set(
      phase,
      (context.durations.get(phase) ?? 0) + durationMs,
    );
  }
}
