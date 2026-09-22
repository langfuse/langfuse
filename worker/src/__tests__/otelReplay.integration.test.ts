import "./helpers/otelReplaySetup";

import { Decimal } from "decimal.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ResourceSpan } from "@langfuse/shared/src/server";
import { runOtelReplay } from "./helpers/otelReplayHarness";
import {
  configureDefaultOtelReplayMocks,
  configureOtelReplayEnvironment,
  otelReplayMocks,
} from "./helpers/otelReplaySetup";

const PROJECT_ID = "otel-replay-integration";
const FILE_KEY = "otel-replay/integration.json";
const TRACE_ID = "11111111111111111111111111111111";
const FIRST_SPAN_ID = "2222222222222222";
const SECOND_SPAN_ID = "3333333333333333";

function createBufferId(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}

function stringAttribute(key: string, value: string) {
  return { key, value: { stringValue: value } };
}

function intAttribute(key: string, value: number) {
  return {
    key,
    value: { intValue: { low: value, high: 0, unsigned: false } },
  };
}

function logicalEventBytes(row: Record<string, unknown>): number {
  const withoutEventBytes = Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== "event_bytes"),
  );
  return Buffer.byteLength(JSON.stringify(withoutEventBytes), "utf8");
}

function buildResourceSpans(): ResourceSpan[] {
  const imageDataUri = `data:image/png;base64,${Buffer.from("small-image").toString("base64")}`;
  const commonAttributes = [
    stringAttribute("langfuse.observation.type", "generation"),
    stringAttribute("langfuse.observation.model.name", "gpt-4o-mini"),
    stringAttribute("langfuse.observation.prompt.name", "replay-prompt"),
    intAttribute("langfuse.observation.prompt.version", 3),
    stringAttribute("langfuse.trace.name", "replay-trace"),
    stringAttribute("user.id", "replay-user"),
    stringAttribute("session.id", "replay-session"),
    stringAttribute("langfuse.observation.metadata.source", "integration"),
    { key: "gen_ai.request.temperature", value: { doubleValue: 0.25 } },
  ];

  return [
    {
      resource: {
        attributes: [
          stringAttribute("service.name", "otel-replay-service"),
          stringAttribute("service.version", "1.2.3"),
          stringAttribute("telemetry.sdk.language", "typescript"),
          stringAttribute("telemetry.sdk.name", "otel-replay"),
          stringAttribute("telemetry.sdk.version", "0.1.0"),
          stringAttribute("langfuse.environment", "integration"),
          stringAttribute("langfuse.release", "replay-release"),
        ],
      },
      scopeSpans: [
        {
          scope: { name: "langfuse-sdk", version: "3.0.0" },
          spans: [
            {
              traceId: createBufferId(TRACE_ID),
              spanId: createBufferId(FIRST_SPAN_ID),
              name: "replay-generation-with-media",
              kind: 1,
              startTimeUnixNano: "1714488530686000000",
              endTimeUnixNano: "1714488530687000000",
              attributes: [
                ...commonAttributes,
                stringAttribute("langfuse.observation.input", imageDataUri),
                stringAttribute(
                  "langfuse.observation.output",
                  "short replay answer",
                ),
              ],
              status: { code: 0 },
            },
            {
              traceId: createBufferId(TRACE_ID),
              spanId: createBufferId(SECOND_SPAN_ID),
              parentSpanId: createBufferId(FIRST_SPAN_ID),
              name: "replay-generation-with-overflow",
              kind: 1,
              startTimeUnixNano: "1714488531686000000",
              endTimeUnixNano: "1714488531687000000",
              attributes: [
                ...commonAttributes,
                stringAttribute("langfuse.observation.input", "plain input"),
                stringAttribute(
                  "langfuse.observation.output",
                  "x".repeat(1024),
                ),
                stringAttribute(
                  "langfuse.observation.cost_details",
                  JSON.stringify({
                    input: 1_500_000,
                    output: -1_500_000,
                    total: 1_500_000,
                  }),
                ),
              ],
              status: { code: 0 },
            },
          ],
        },
      ],
    },
  ];
}

// Avoid re-entering the process-wide writer singleton when a test times out
// while ClickHouseWriter is still retrying an insert.
describe(
  "OTEL replay production path with ClickHouse persistence",
  { retry: 0, timeout: 120_000 },
  () => {
    let restoreEnvironment: (() => void) | undefined;

    beforeEach(() => {
      configureDefaultOtelReplayMocks();
      restoreEnvironment = configureOtelReplayEnvironment({
        mediaUploadEnabled: true,
        overflowEnabled: true,
        overflowSizeLimitBytes: 256,
      });

      const model = {
        id: "otel-replay-model",
        modelName: "gpt-4o-mini",
        tokenizerId: "openai",
        tokenizerConfig: { tokenizerModel: "gpt-4o" },
      };
      otelReplayMocks.findModel.mockResolvedValue({
        model,
        pricingTiers: [
          {
            id: "otel-replay-tier",
            name: "Replay default",
            isDefault: true,
            priority: 0,
            conditions: [],
            prices: [
              { usageType: "input", price: new Decimal("0.01") },
              { usageType: "output", price: new Decimal("0.02") },
            ],
          },
        ],
      });
      otelReplayMocks.getPrompt.mockResolvedValue({ id: "replay-prompt-id" });
      otelReplayMocks.fetchObservationEvalRules.mockResolvedValue([{}]);
      otelReplayMocks.createObservationEvalSchedulerDeps.mockReturnValue({});
      otelReplayMocks.scheduleObservationEvals.mockResolvedValue(undefined);
      otelReplayMocks.uploadMediaForTrace.mockImplementation(
        async (params: { field: string }) => ({
          mediaId:
            params.field === "input" ? "image-media-id" : "overflow-media-id",
          outcome: "uploaded" as const,
        }),
      );
    });

    afterEach(() => {
      restoreEnvironment?.();
      restoreEnvironment = undefined;
      // The test owns this mutable mock setup; restore its deterministic
      // defaults so another worker suite in the same process is unaffected.
      configureDefaultOtelReplayMocks();
    });

    it("writes both enriched observations and preserves accounting through readback", async () => {
      const { queuedRows, storedRows } = await runOtelReplay({
        resourceSpans: buildResourceSpans(),
        projectId: PROJECT_ID,
        fileKey: FILE_KEY,
      });

      expect(queuedRows).toHaveLength(2);
      expect(storedRows).toHaveLength(2);
      expect(otelReplayMocks.scheduleObservationEvals).toHaveBeenCalledTimes(2);

      const rowsBySpanId = new Map(
        storedRows.map((row) => [String(row.span_id), row]),
      );
      const firstRow = rowsBySpanId.get(FIRST_SPAN_ID);
      const secondRow = rowsBySpanId.get(SECOND_SPAN_ID);
      expect(firstRow).toBeDefined();
      expect(secondRow).toBeDefined();

      expect(firstRow).toMatchObject({
        project_id: PROJECT_ID,
        trace_id: TRACE_ID,
        span_id: FIRST_SPAN_ID,
        parent_span_id: "",
        name: "replay-generation-with-media",
        type: "GENERATION",
        environment: "integration",
        release: "replay-release",
        trace_name: "replay-trace",
        user_id: "replay-user",
        session_id: "replay-session",
        prompt_id: "replay-prompt-id",
        prompt_name: "replay-prompt",
        prompt_version: 3,
        model_id: "otel-replay-model",
        provided_model_name: "gpt-4o-mini",
        usage_pricing_tier_id: "otel-replay-tier",
        usage_pricing_tier_name: "Replay default",
        ingestion_sdk_name: "otel-replay",
        ingestion_sdk_version: "test",
        blob_storage_file_path: FILE_KEY,
      });
      expect(String(firstRow?.input)).toContain(
        "@@@langfuseMedia:type=image/png|id=image-media-id|source=",
      );
      expect(firstRow?.output).toBe("short replay answer");
      expect(firstRow?.metadata_names).toContain("source");
      expect(firstRow?.metadata_values).toContain("integration");
      expect(
        Number((firstRow?.usage_details as Record<string, unknown>).input),
      ).toBeGreaterThan(0);
      expect(
        Number((firstRow?.usage_details as Record<string, unknown>).output),
      ).toBeGreaterThan(0);
      expect(
        Number((firstRow?.cost_details as Record<string, unknown>).total),
      ).toBeGreaterThan(0);

      expect(secondRow).toMatchObject({
        project_id: PROJECT_ID,
        trace_id: TRACE_ID,
        span_id: SECOND_SPAN_ID,
        parent_span_id: FIRST_SPAN_ID,
        name: "replay-generation-with-overflow",
        type: "GENERATION",
        prompt_id: "replay-prompt-id",
        model_id: "otel-replay-model",
        provided_model_name: "gpt-4o-mini",
        usage_details: {},
        provided_cost_details: {
          input: 999_999.999999,
          output: -999_999.999999,
          total: 999_999.999999,
        },
        cost_details: {
          input: 999_999.999999,
          output: -999_999.999999,
          total: 999_999.999999,
        },
      });
      expect(secondRow?.input).toBe("plain input");
      expect(secondRow?.output).toBe(
        "@@@langfuseMedia:type=text/plain|id=overflow-media-id|source=field_size_limit@@@",
      );

      const queuedBySpanId = new Map(
        queuedRows.map((row) => [String(row.span_id), row]),
      );
      for (const row of storedRows) {
        const queued = queuedBySpanId.get(String(row.span_id));
        expect(queued).toBeDefined();
        const expectedLogicalBytes = logicalEventBytes(queued!);
        expect(Number(queued?.event_bytes)).toBe(expectedLogicalBytes);
        expect(Number(row.event_bytes)).toBe(expectedLogicalBytes);
      }

      const queuedSecondRow = queuedBySpanId.get(SECOND_SPAN_ID);
      expect(queuedSecondRow).toBeDefined();
      expect(queuedSecondRow?.provided_cost_details).toEqual({
        input: 1_500_000,
        output: -1_500_000,
        total: 1_500_000,
      });
      expect(queuedSecondRow?.cost_details).toEqual({
        input: 1_500_000,
        output: -1_500_000,
        total: 1_500_000,
      });

      const rawLogicalBytes = logicalEventBytes(queuedSecondRow!);
      const clampedLogicalBytes = logicalEventBytes({
        ...queuedSecondRow!,
        provided_cost_details: secondRow!.provided_cost_details,
        cost_details: secondRow!.cost_details,
      });
      expect(clampedLogicalBytes).not.toBe(rawLogicalBytes);
      expect(Number(secondRow?.event_bytes)).toBe(rawLogicalBytes);
      expect(Number(secondRow?.event_bytes)).not.toBe(clampedLogicalBytes);
    });
  },
);
