import { describe, expect, it, vi } from "vitest";

// processToIngestionEvents awaits redis.set (seen-traces tracking); stub it
// so tests don't require an active Redis connection.
vi.mock("../redis/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../redis/redis")>()),
  redis: { set: vi.fn().mockResolvedValue("OK") },
}));

import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";

describe("OtelIngestionProcessor extractUserId", () => {
  const createBatch = ({
    spanAttributes = [],
    resourceAttributes = [],
  }: {
    spanAttributes?: Array<{ key: string; value: Record<string, unknown> }>;
    resourceAttributes?: Array<{ key: string; value: Record<string, unknown> }>;
  }): ResourceSpan[] => [
    {
      resource: {
        attributes: resourceAttributes,
      },
      scopeSpans: [
        {
          scope: { name: "test-scope", version: "1.0.0" },
          spans: [
            {
              traceId: Buffer.from("0123456789abcdef0123456789abcdef", "hex"),
              spanId: Buffer.from("0123456789abcdef", "hex"),
              name: "invoke_agent",
              kind: 3,
              startTimeUnixNano: "1752384000000000000",
              endTimeUnixNano: "1752384001000000000",
              attributes: spanAttributes,
              status: {},
            },
          ],
        },
      ],
    },
  ];

  const processor = new OtelIngestionProcessor({
    projectId: "project-1",
    publicKey: "pk-test",
    sdkName: "test-sdk",
    sdkVersion: "1.0.0",
  });

  describe("span attributes", () => {
    it("extracts userId from span user.id", () => {
      const batch = createBatch({
        spanAttributes: [
          { key: "user.id", value: { stringValue: "span-user-id" } },
        ],
      });

      const events = processor.processToEvent(batch);
      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe("span-user-id");
    });

    it("extracts userId from span user.name (e.g. GitHub Copilot invoke_agent)", () => {
      const batch = createBatch({
        spanAttributes: [
          { key: "user.name", value: { stringValue: "copilot-user" } },
        ],
      });

      const events = processor.processToEvent(batch);
      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe("copilot-user");
    });

    it("extracts userId from span langfuse.user.id", () => {
      const batch = createBatch({
        spanAttributes: [
          { key: "langfuse.user.id", value: { stringValue: "custom-user-id" } },
        ],
      });

      const events = processor.processToEvent(batch);
      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe("custom-user-id");
    });
  });

  describe("resource attributes fallback", () => {
    it("extracts userId from resourceAttributes user.id", () => {
      const batch = createBatch({
        resourceAttributes: [
          { key: "user.id", value: { stringValue: "resource-user-id" } },
        ],
      });

      const events = processor.processToEvent(batch);
      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe("resource-user-id");
    });

    it("extracts userId from resourceAttributes user.name", () => {
      const batch = createBatch({
        resourceAttributes: [
          { key: "user.name", value: { stringValue: "resource-user-name" } },
        ],
      });

      const events = processor.processToEvent(batch);
      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe("resource-user-name");
    });

    it("extracts userId from resourceAttributes process.user.name (e.g. GitHub Copilot)", () => {
      const batch = createBatch({
        resourceAttributes: [
          {
            key: "process.user.name",
            value: { stringValue: "copilot-process-user" },
          },
        ],
      });

      const events = processor.processToEvent(batch);
      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe("copilot-process-user");
    });

    it("extracts userId from resourceAttributes langfuse.user.id", () => {
      const batch = createBatch({
        resourceAttributes: [
          {
            key: "langfuse.user.id",
            value: { stringValue: "resource-langfuse-user" },
          },
        ],
      });

      const events = processor.processToEvent(batch);
      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe("resource-langfuse-user");
    });
  });

  describe("precedence", () => {
    it("prefers span user.id over span user.name, resource user.id, and resource process.user.name", () => {
      const batch = createBatch({
        spanAttributes: [
          { key: "user.id", value: { stringValue: "winner-span-id" } },
          { key: "user.name", value: { stringValue: "loser-span-name" } },
        ],
        resourceAttributes: [
          { key: "user.id", value: { stringValue: "loser-resource-id" } },
          {
            key: "process.user.name",
            value: { stringValue: "loser-resource-process" },
          },
        ],
      });

      const events = processor.processToEvent(batch);
      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe("winner-span-id");
    });

    it("prefers span user.name over resource user.id and resource process.user.name", () => {
      const batch = createBatch({
        spanAttributes: [
          { key: "user.name", value: { stringValue: "winner-span-name" } },
        ],
        resourceAttributes: [
          { key: "user.id", value: { stringValue: "loser-resource-id" } },
          {
            key: "process.user.name",
            value: { stringValue: "loser-resource-process" },
          },
        ],
      });

      const events = processor.processToEvent(batch);
      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe("winner-span-name");
    });

    it("prefers resource user.id over resource user.name and resource process.user.name", () => {
      const batch = createBatch({
        resourceAttributes: [
          { key: "user.id", value: { stringValue: "winner-resource-id" } },
          { key: "user.name", value: { stringValue: "loser-resource-name" } },
          {
            key: "process.user.name",
            value: { stringValue: "loser-resource-process" },
          },
        ],
      });

      const events = processor.processToEvent(batch);
      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe("winner-resource-id");
    });

    it("prefers resource user.name over resource process.user.name", () => {
      const batch = createBatch({
        resourceAttributes: [
          { key: "user.name", value: { stringValue: "winner-resource-name" } },
          {
            key: "process.user.name",
            value: { stringValue: "loser-resource-process" },
          },
        ],
      });

      const events = processor.processToEvent(batch);
      expect(events).toHaveLength(1);
      expect(events[0].userId).toBe("winner-resource-name");
    });
  });

  describe("processToIngestionEvents trace extraction", () => {
    it("populates userId on trace from resourceAttributes", async () => {
      const batch = createBatch({
        resourceAttributes: [
          { key: "process.user.name", value: { stringValue: "copilot-dev" } },
        ],
      });

      const ingestionEvents = await processor.processToIngestionEvents(batch);
      const traceEvent = ingestionEvents.find((e) => e.type === "trace-create");

      expect(traceEvent).toBeDefined();
      expect((traceEvent?.body as any).userId).toBe("copilot-dev");
    });

    it("populates userId on trace from span user.name", async () => {
      const batch = createBatch({
        spanAttributes: [
          { key: "user.name", value: { stringValue: "agent-caller" } },
        ],
        resourceAttributes: [
          { key: "process.user.name", value: { stringValue: "os-user" } },
        ],
      });

      const ingestionEvents = await processor.processToIngestionEvents(batch);
      const traceEvent = ingestionEvents.find((e) => e.type === "trace-create");

      expect(traceEvent).toBeDefined();
      expect((traceEvent?.body as any).userId).toBe("agent-caller");
    });
  });
});
