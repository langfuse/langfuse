/**
 * AI Gateway "Show traces" filters traces.metadata by api_key.id / owner.user_id.
 * Those keys are written on the generation observation. When the caller
 * propagates W3C traceparent, the generation is a child span and must still
 * emit a trace-create that merges the trusted keys onto the trace record.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../redis/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../redis/redis")>()),
  redis: { set: vi.fn().mockResolvedValue("OK") },
}));

import {
  AI_GATEWAY_KEY_ID_METADATA_KEY,
  AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY,
} from "../../features/ai-gateway/constants";
import {
  AI_GATEWAY_INSTRUMENTATION_SCOPE_NAME,
  aiGatewayIngestionApiKey,
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";

const PROJECT_ID = "test-project-gateway-attribution";
const TRACE_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PARENT_SPAN_ID = "bbbbbbbbbbbbbbbb";
const CHILD_SPAN_ID = "cccccccccccccccc";
const START = "1700000000000000000";
const END = "1700000001000000000";

const gatewayPublicKey = aiGatewayIngestionApiKey("grant-test");

const createProcessor = (publicKey: string) =>
  new OtelIngestionProcessor({
    projectId: PROJECT_ID,
    publicKey,
    sdkName: "langfuse-ai-gateway",
    sdkVersion: "0.0.0",
  });

const gatewayChildBatch = (options?: {
  includeOwner?: boolean;
}): ResourceSpan[] => {
  const includeOwner = options?.includeOwner ?? true;
  const scopeName = AI_GATEWAY_INSTRUMENTATION_SCOPE_NAME;

  const metadata: Record<string, string> = {
    [AI_GATEWAY_KEY_ID_METADATA_KEY]: "key-123",
  };
  if (includeOwner) {
    metadata[AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY] = "user-123";
  }

  return [
    {
      resource: {
        attributes: [
          {
            key: "service.name",
            value: { stringValue: "langfuse-ai-gateway" },
          },
        ],
      },
      scopeSpans: [
        {
          scope: { name: scopeName, version: "1.0.0", attributes: [] },
          spans: [
            {
              traceId: Buffer.from(TRACE_ID, "hex"),
              spanId: Buffer.from(CHILD_SPAN_ID, "hex"),
              parentSpanId: Buffer.from(PARENT_SPAN_ID, "hex"),
              name: "openai-chat-completions",
              kind: 3,
              startTimeUnixNano: START,
              endTimeUnixNano: END,
              attributes: [
                {
                  key: "langfuse.observation.type",
                  value: { stringValue: "generation" },
                },
                {
                  key: "langfuse.observation.metadata",
                  value: { stringValue: JSON.stringify(metadata) },
                },
              ],
              status: { code: 0 },
            },
          ],
        },
      ],
    },
  ];
};

const traceCreates = (events: Array<{ type: string; body: any }>) =>
  events.filter((event) => event.type === "trace-create");

describe("OtelIngestionProcessor gateway trace attribution", () => {
  it("merges trusted key and owner ids onto the trace for a child generation", async () => {
    const processor = createProcessor(gatewayPublicKey);
    const events =
      await processor.processToIngestionEvents(gatewayChildBatch());
    const traces = traceCreates(events);

    expect(traces).toHaveLength(1);
    expect(traces[0]?.body).toMatchObject({
      id: TRACE_ID,
      metadata: {
        [AI_GATEWAY_KEY_ID_METADATA_KEY]: "key-123",
        [AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY]: "user-123",
      },
    });

    const observation = events.find(
      (event) =>
        event.type === "generation-create" || event.type === "span-create",
    );
    expect(observation?.body.metadata).toMatchObject({
      [AI_GATEWAY_KEY_ID_METADATA_KEY]: "key-123",
      [AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY]: "user-123",
    });
  });

  it("still emits a trace update when the parent was already seen", async () => {
    const processor = createProcessor(gatewayPublicKey);
    // Prime seenTraces with the parent trace id via a first empty? We'll call
    // processToIngestionEvents twice: first a non-gateway root, then the child.
    const parentBatch: ResourceSpan[] = [
      {
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "my-app" } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "my-app", version: "1.0.0", attributes: [] },
            spans: [
              {
                traceId: Buffer.from(TRACE_ID, "hex"),
                spanId: Buffer.from(PARENT_SPAN_ID, "hex"),
                name: "agent-run",
                kind: 1,
                startTimeUnixNano: START,
                endTimeUnixNano: END,
                attributes: [
                  {
                    key: "langfuse.trace.name",
                    value: { stringValue: "agent-run" },
                  },
                ],
                status: { code: 0 },
              },
            ],
          },
        ],
      },
    ];

    const first = await processor.processToIngestionEvents(parentBatch);
    expect(traceCreates(first)[0]?.body).toMatchObject({
      id: TRACE_ID,
      name: "agent-run",
    });
    expect(
      traceCreates(first)[0]?.body.metadata?.[AI_GATEWAY_KEY_ID_METADATA_KEY],
    ).toBeUndefined();

    const second =
      await processor.processToIngestionEvents(gatewayChildBatch());
    const traces = traceCreates(second);
    expect(traces).toHaveLength(1);
    expect(traces[0]?.body.metadata).toMatchObject({
      [AI_GATEWAY_KEY_ID_METADATA_KEY]: "key-123",
      [AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY]: "user-123",
    });
  });

  it("does not copy spoofed observation metadata unless the upload uses a gateway grant key", async () => {
    const processor = createProcessor("pk-test");
    const events =
      await processor.processToIngestionEvents(gatewayChildBatch());
    const traces = traceCreates(events);
    // Unseen child still creates a shallow trace (id/timestamp/environment only).
    expect(traces).toHaveLength(1);
    expect(
      traces[0]?.body.metadata?.[AI_GATEWAY_KEY_ID_METADATA_KEY],
    ).toBeUndefined();
  });
});
