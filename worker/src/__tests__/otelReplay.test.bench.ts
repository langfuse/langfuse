import "./helpers/otelReplaySetup";

// Run against local services: pnpm --filter worker exec vitest bench --run otelReplay
// Timings include replay table setup/readback; the scheduler's I/O is simulated.
import { afterAll, bench, describe, expect } from "vitest";

import type { ResourceSpan } from "@langfuse/shared/src/server";

import { runOneOtelReplay } from "./helpers/otelReplayHarness";
import {
  configureDefaultOtelReplayMocks,
  otelReplayMocks,
} from "./helpers/otelReplaySetup";

type ReplayMode = "original-ts" | "early-ts" | "early-rust";
const SPAN_COUNT = 1_000;
const MODES: readonly ReplayMode[] = ["original-ts", "early-ts", "early-rust"];

function stringAttribute(key: string, value: string) {
  return { key, value: { stringValue: value } };
}

function createBenchmarkBytes(): Buffer {
  const spans = Array.from({ length: SPAN_COUNT }, (_, index) => {
    const spanId = (index + 1).toString(16).padStart(16, "0");
    return {
      traceId: Buffer.from(spanId.repeat(2), "hex"),
      spanId: Buffer.from(spanId, "hex"),
      name: `benchmark-generation-${index}`,
      kind: 1,
      startTimeUnixNano: "1714488530686000000",
      endTimeUnixNano: "1714488530687000000",
      attributes: [
        stringAttribute("langfuse.observation.type", "generation"),
        stringAttribute("langfuse.observation.input", `input-${index}`),
        stringAttribute("langfuse.observation.output", `output-${index}`),
      ],
      status: { code: 0 },
    };
  });
  const resourceSpans: ResourceSpan[] = [
    {
      resource: {
        attributes: [
          stringAttribute("service.name", "otel-replay-benchmark"),
          stringAttribute("telemetry.sdk.name", "otel-replay"),
          stringAttribute("telemetry.sdk.version", "0.1.0"),
        ],
      },
      scopeSpans: [
        { scope: { name: "langfuse-sdk", version: "3.0.0" }, spans },
      ],
    },
  ];
  return Buffer.from(JSON.stringify(resourceSpans));
}

const benchmarkBytes = createBenchmarkBytes();
const measurements: Array<{
  mode: ReplayMode;
  delayMs: number;
  totalWallMs: number;
  scheduled: number;
  peakScheduled: number;
}> = [];

function configureEvaluationMock(delayMs: number) {
  let active = 0;
  let peakScheduled = 0;
  let scheduled = 0;
  otelReplayMocks.fetchEvalRules.mockResolvedValue({
    observationRules: [{}],
    traceTranscriptRules: [],
  });
  otelReplayMocks.scheduleObservationEvals.mockImplementation(async () => {
    active += 1;
    scheduled += 1;
    peakScheduled = Math.max(peakScheduled, active);
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } else {
      await Promise.resolve();
    }
    active -= 1;
  });
  return () => ({ scheduled, peakScheduled });
}

describe("OTEL replay evaluation scheduling benchmark", () => {
  for (const delayMs of [0, 1]) {
    for (const mode of MODES) {
      bench(
        `${mode} · ${delayMs}ms evaluation scheduling delay`,
        async () => {
          configureDefaultOtelReplayMocks();
          const readEvaluationStats = configureEvaluationMock(delayMs);
          const startedAt = performance.now();
          const result = await runOneOtelReplay({
            bytes: benchmarkBytes,
            mode,
            projectId: `otel-replay-bench-${mode}`,
            fileKey: `otel-replay/bench-${mode}.json`,
            mediaUploadEnabled: false,
            overflowEnabled: false,
            writeMode: "events_only",
          });
          const totalWallMs = performance.now() - startedAt;
          const evaluation = readEvaluationStats();
          expect(evaluation.scheduled, `${mode}: evaluation count`).toBe(
            SPAN_COUNT,
          );
          expect(
            result.storedRows,
            `${mode}: persisted row count`,
          ).toHaveLength(SPAN_COUNT);
          expect(
            new Set(result.storedRows.map((row) => String(row.span_id))).size,
            `${mode}: persisted span ids`,
          ).toBe(SPAN_COUNT);
          measurements.push({
            mode,
            delayMs,
            totalWallMs,
            scheduled: evaluation.scheduled,
            peakScheduled: evaluation.peakScheduled,
          });
        },
        { iterations: 3, warmupIterations: 1, time: 0, warmupTime: 0 },
      );
    }
  }
});

afterAll(() => {
  if (measurements.length === 0) return;
  console.info(
    `OTEL_REPLAY_BENCH_RESULT ${JSON.stringify({
      spanCount: SPAN_COUNT,
      samples: measurements,
      note: "totalWallMs includes ClickHouse table setup, replay, flush, readback, and cleanup",
    })}`,
  );
});
