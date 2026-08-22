/**
 * Regression tests for the trace-root selection in the OTel ingestion path.
 *
 * Issue: https://github.com/langfuse/langfuse/issues/15860
 *
 * In a distributed setup several processes contribute observations to one
 * trace id. Each process-local LangChain root chain is started under a remote
 * parent (the SDK joins the foreign trace via trace_context and sets
 * langfuse.internal.as_root on the span), so it carries a parent span id but
 * is still flagged as a "root". Treating such spans as the trace root promoted
 * their observation-level input/output onto the trace record, so the trace
 * name and IO came from whichever joining process was ingested last.
 *
 * The fix: a span with a parent span of its own is never the trace root, so
 * joining processes no longer overwrite the true root's name and IO.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { recordIncrementMock } = vi.hoisted(() => ({
  recordIncrementMock: vi.fn(),
}));

vi.mock("../instrumentation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../instrumentation")>();
  return {
    ...actual,
    recordIncrement: recordIncrementMock,
  };
});

// processToIngestionEvents awaits redis.set (seen-traces tracking); CI's
// tests-shared job has REDIS_HOST set but no Redis server, so ioredis
// queues the command forever and the suite times out. Stub the client.
vi.mock("../redis/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../redis/redis")>()),
  redis: { set: vi.fn().mockResolvedValue("OK") },
}));

import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";

const PROJECT_ID = "test-project-trace-root";

const createProcessor = () =>
  new OtelIngestionProcessor({
    projectId: PROJECT_ID,
    publicKey: "pk-test",
    sdkName: "python",
    sdkVersion: "4.14.3",
  });

type OtelAttribute = { key: string; value: Record<string, unknown> };

const TRACE_ID = Buffer.from("0123456789abcdef0123456789abcdef", "hex");
const ROOT_SPAN_ID = Buffer.from("0123456789abcdef", "hex");
const JOIN_SPAN_ID = Buffer.from("fedcba9876543210", "hex");

const buildSpan = ({
  spanId,
  parentSpanId,
  name,
  attributes,
}: {
  spanId: Buffer;
  parentSpanId?: Buffer;
  name: string;
  attributes: OtelAttribute[];
}): ResourceSpan[] => [
  {
    resource: {
      attributes: [{ key: "service.name", value: { stringValue: "test-svc" } }],
    },
    scopeSpans: [
      {
        scope: {
          name: "langfuse-sdk",
          version: "4.14.3",
          attributes: [
            { key: "public_key", value: { stringValue: "pk-test" } },
          ],
        },
        spans: [
          {
            traceId: TRACE_ID,
            spanId,
            parentSpanId,
            name,
            kind: 1,
            startTimeUnixNano: "1752384000000000000",
            endTimeUnixNano: "1752384001000000000",
            attributes: [
              {
                key: "langfuse.observation.type",
                value: { stringValue: "span" },
              },
              ...attributes,
            ],
            status: {},
          },
        ],
      },
    ],
  },
];

// The orchestrator owns the trace: it is the root span and sets trace-level IO.
const rootOrchestratorSpan = () =>
  buildSpan({
    spanId: ROOT_SPAN_ID,
    name: "orchestrator",
    attributes: [
      {
        key: "langfuse.trace.name",
        value: { stringValue: "orchestrator-trace" },
      },
      { key: "langfuse.trace.input", value: { stringValue: "user question" } },
      { key: "langfuse.trace.output", value: { stringValue: "answer" } },
    ],
  });

// A specialist process joins the trace under the orchestrator's span. The SDK
// starts its LangChain root chain under a remote parent and flags it as_root,
// but it has a real parent span id within the trace.
const joiningSpecialistSpan = (extraAttributes: OtelAttribute[] = []) =>
  buildSpan({
    spanId: JOIN_SPAN_ID,
    parentSpanId: ROOT_SPAN_ID,
    name: "specialist",
    attributes: [
      {
        key: "langfuse.observation.input",
        value: { stringValue: "specialist input" },
      },
      {
        key: "langfuse.observation.output",
        value: { stringValue: "specialist output" },
      },
      { key: "langfuse.internal.as_root", value: { boolValue: true } },
      ...extraAttributes,
    ],
  });

describe("OTel trace root selection (#15860)", () => {
  beforeEach(() => {
    recordIncrementMock.mockClear();
  });

  it("keeps trace name and IO on the true root when a joining process is ingested after it", async () => {
    const events = await createProcessor().processToIngestionEvents([
      ...rootOrchestratorSpan(),
      ...joiningSpecialistSpan(),
    ]);

    const traceCreates = events.filter(
      (event) => event.type === "trace-create",
    );
    expect(traceCreates).toHaveLength(1);
    const trace = traceCreates[0].body;
    expect(trace.name).toBe("orchestrator-trace");
    expect(trace.input).toBe("user question");
    expect(trace.output).toBe("answer");
  });

  it("does not let the last-ingested joining process win the trace name and IO", async () => {
    // The specialist's spans are ingested before the orchestrator's root span.
    const events = await createProcessor().processToIngestionEvents([
      ...joiningSpecialistSpan(),
      ...rootOrchestratorSpan(),
    ]);

    const traceCreates = events.filter(
      (event) => event.type === "trace-create",
    );
    const fullTrace = traceCreates.find(
      (event) => event.body.name !== undefined && event.body.name !== null,
    );
    expect(fullTrace).toBeDefined();
    expect(fullTrace!.body.name).toBe("orchestrator-trace");
    expect(fullTrace!.body.input).toBe("user question");
    expect(fullTrace!.body.output).toBe("answer");

    // The joining process must never appear as the trace owner.
    for (const event of traceCreates) {
      expect(event.body.name).not.toBe("specialist");
      expect(event.body.input).not.toBe("specialist input");
      expect(event.body.output).not.toBe("specialist output");
    }
  });

  it("still applies explicit trace updates from a joining process", async () => {
    const events = await createProcessor().processToIngestionEvents([
      ...rootOrchestratorSpan(),
      ...joiningSpecialistSpan([
        { key: "session.id", value: { stringValue: "abc123" } },
      ]),
    ]);

    const traceCreates = events.filter(
      (event) => event.type === "trace-create",
    );
    const traceUpdate = traceCreates.find(
      (event) => event.body.sessionId === "abc123",
    );
    expect(traceUpdate).toBeDefined();

    // The update must not clobber the root's name and IO.
    const rootTrace = traceCreates.find(
      (event) => event.body.name === "orchestrator-trace",
    );
    expect(rootTrace).toBeDefined();
    expect(rootTrace!.body.input).toBe("user question");
    expect(rootTrace!.body.output).toBe("answer");
  });
});
