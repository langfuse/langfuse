/**
 * Claude Code (`com.anthropic.claude_code.tracing`) exports one
 * `claude_code.llm_request` span per model call. Token counts, the speed mode
 * and time-to-first-token arrive as bare attributes rather than under the
 * GenAI semantic conventions, and `input_tokens` follows the Anthropic API:
 * it excludes cache reads and cache writes.
 */
import { describe, it, expect, vi } from "vitest";

// processToIngestionEvents awaits redis.set (seen-traces tracking); stub the
// client so the suite runs without a Redis server.
vi.mock("../redis/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../redis/redis")>()),
  redis: { set: vi.fn().mockResolvedValue("OK") },
}));

import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";

const CLAUDE_CODE_SCOPE = "com.anthropic.claude_code.tracing";

const intValue = (value: number) => ({ intValue: String(value) });
const stringValue = (value: string) => ({ stringValue: value });

const buildLlmRequestBatch = (
  overrides: Record<string, Record<string, unknown>> = {},
): ResourceSpan[] => {
  const attributes: Record<string, Record<string, unknown>> = {
    "span.type": stringValue("llm_request"),
    model: stringValue("claude-opus-5-5"),
    "gen_ai.system": stringValue("anthropic"),
    "gen_ai.request.model": stringValue("claude-opus-5-5"),
    "llm_request.context": stringValue("interaction"),
    speed: stringValue("normal"),
    effort: stringValue("medium"),
    duration_ms: intValue(4705),
    ttft_ms: intValue(1341),
    first_content_ms: intValue(1342),
    input_tokens: intValue(2),
    output_tokens: intValue(333),
    cache_read_tokens: intValue(63002),
    cache_creation_tokens: intValue(679),
    success: stringValue("true"),
    attempt: intValue(1),
    stop_reason: stringValue("tool_use"),
    ...overrides,
  };

  return [
    {
      resource: {
        attributes: [
          { key: "service.name", value: stringValue("claude-code") },
          { key: "service.version", value: stringValue("2.1.287") },
        ],
      },
      scopeSpans: [
        {
          scope: { name: CLAUDE_CODE_SCOPE, version: "1.0.0" },
          spans: [
            {
              traceId: Buffer.from("f996f9fc4575b1ce4e7dfc4de5b6dcf7", "hex"),
              spanId: Buffer.from("f3816a9fbd63e3d6", "hex"),
              name: "claude_code.llm_request",
              kind: 1,
              startTimeUnixNano: "1790936476112000000",
              endTimeUnixNano: "1790936480817000000",
              attributes: Object.entries(attributes).map(([key, value]) => ({
                key,
                value,
              })),
              status: {},
            },
          ],
        },
      ],
    },
  ];
};

const createProcessor = () =>
  new OtelIngestionProcessor({
    projectId: "project-1",
    publicKey: "pk-test",
    sdkName: "unknown",
    sdkVersion: "unknown",
  });

const processLlmRequest = async (
  path: "v3" | "v4",
  batch: ResourceSpan[],
): Promise<Record<string, any> | undefined> =>
  path === "v4"
    ? createProcessor().processToEvent(batch)[0]
    : (await createProcessor().processToIngestionEvents(batch)).find(
        (event) => event.type === "generation-create",
      )?.body;

describe.each(["v3", "v4"] as const)(
  "OtelIngestionProcessor Claude Code llm_request (%s)",
  (path) => {
    it("maps token counts without subtracting cache from input", async () => {
      const observation = await processLlmRequest(path, buildLlmRequestBatch());

      const usageDetails =
        path === "v4"
          ? observation?.providedUsageDetails
          : observation?.usageDetails;

      expect(usageDetails).toEqual({
        input: 2,
        output: 333,
        input_cached_tokens: 63002,
        input_cache_creation: 679,
      });
    });

    it("passes the speed mode through as a model parameter", async () => {
      const observation = await processLlmRequest(
        path,
        buildLlmRequestBatch({ speed: stringValue("fast") }),
      );

      expect(observation?.modelParameters).toMatchObject({ speed: "fast" });
    });

    it("derives the completion start time from ttft_ms", async () => {
      const observation = await processLlmRequest(path, buildLlmRequestBatch());

      expect(observation?.completionStartTime).toBe(
        new Date(1790936476112 + 1341).toISOString(),
      );
    });
  },
);
