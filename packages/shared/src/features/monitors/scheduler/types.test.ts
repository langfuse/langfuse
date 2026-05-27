import { describe, it, expect } from "vitest";

import {
  MonitorQueueEventSchema,
  MonitorWebhookQueueEventSchema,
} from "./types";

describe("MonitorQueueEventSchema", () => {
  const validQueueEvent = {
    projectId: "proj_01",
    schedulerBatchId: 42n,
    runAt: new Date("2026-05-18T12:00:00.000Z"),
    view: "observations" as const,
    filters: [],
    window: "5m" as const,
    metrics: [{ measure: "count", aggregation: "count" as const }],
    monitors: [{ monitorId: "mon_01", metricName: "count_count" }],
  };

  it("parses a representative queue event", () => {
    const result = MonitorQueueEventSchema.safeParse(validQueueEvent);
    expect(result.success).toBe(true);
  });

  it("coerces a string runAt to a Date", () => {
    const result = MonitorQueueEventSchema.safeParse({
      ...validQueueEvent,
      runAt: "2026-05-18T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.runAt).toBeInstanceOf(Date);
  });

  it("coerces a string schedulerBatchId to a bigint", () => {
    const result = MonitorQueueEventSchema.safeParse({
      ...validQueueEvent,
      schedulerBatchId: "42",
    });
    expect(result.success).toBe(true);
    if (result.success)
      expect(typeof result.data.schedulerBatchId).toBe("bigint");
  });

  it("rejects a window outside the MonitorWindow tier set", () => {
    expect(
      MonitorQueueEventSchema.safeParse({
        ...validQueueEvent,
        window: "bogus",
      }).success,
    ).toBe(false);
  });

  it("rejects a negative schedulerBatchId", () => {
    // `calculateSchedulerBatchId` masks the sha256 high 8 bytes with
    // `& (2^63 - 1)`, so the producer can never emit a negative value. Guard
    // the wire boundary so anything else looks like an obvious validator
    // failure rather than corrupted data.
    expect(
      MonitorQueueEventSchema.safeParse({
        ...validQueueEvent,
        schedulerBatchId: -1n,
      }).success,
    ).toBe(false);
  });

  it("accepts zero as a schedulerBatchId", () => {
    // Cryptographically improbable but mathematically possible; the
    // refinement is `.nonnegative()`, not `.positive()`, to match the
    // producer's contract.
    expect(
      MonitorQueueEventSchema.safeParse({
        ...validQueueEvent,
        schedulerBatchId: 0n,
      }).success,
    ).toBe(true);
  });

  it("accepts an empty monitors array", () => {
    // Scheduler may publish with zero monitors if everything in the batch was
    // filtered out — schema should not block; downstream worker handles it.
    expect(
      MonitorQueueEventSchema.safeParse({ ...validQueueEvent, monitors: [] })
        .success,
    ).toBe(true);
  });
});

describe("MonitorWebhookQueueEventSchema", () => {
  const validEnvelope = {
    type: "monitor-alert" as const,
    version: "v1" as const,
    payload: {
      monitorId: "mon_01",
      projectId: "proj_01",
      severity: "ALERT" as const,
      permalink: "https://cloud.langfuse.com/project/proj_01/monitors/mon_01",
      timestamp: new Date("2026-05-18T12:01:00.000Z"),
      message: { title: "High error rate", body: "errors > 100" },
      view: "observations" as const,
      filters: [],
      window: "5m" as const,
    },
  };

  it("parses a valid envelope", () => {
    expect(
      MonitorWebhookQueueEventSchema.safeParse(validEnvelope).success,
    ).toBe(true);
  });

  it("rejects a wrong type discriminator", () => {
    expect(
      MonitorWebhookQueueEventSchema.safeParse({
        ...validEnvelope,
        type: "prompt-version",
      }).success,
    ).toBe(false);
  });

  it("rejects a wrong version literal", () => {
    expect(
      MonitorWebhookQueueEventSchema.safeParse({
        ...validEnvelope,
        version: "v2",
      }).success,
    ).toBe(false);
  });
});

describe("scheduler DTO JSON round-trip (wire contract)", () => {
  // BigInt and Date can't be JSON-stringified natively; the wire schemas use
  // `z.coerce.*` to recover them on the consumer side. These tests lock that
  // contract: produce → JSON.stringify → JSON.parse → schema.parse must
  // round-trip successfully.

  const stringifyWithBigInt = (value: unknown) =>
    JSON.stringify(value, (_key, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );

  it("round-trips a MonitorQueueEvent through JSON", () => {
    const event = {
      projectId: "proj_01",
      schedulerBatchId: 42n,
      runAt: new Date("2026-05-18T12:00:00.000Z"),
      view: "observations" as const,
      filters: [],
      window: "5m" as const,
      metrics: [{ measure: "count", aggregation: "count" as const }],
      monitors: [{ monitorId: "mon_01", metricName: "count_count" }],
    };
    const wire = JSON.parse(stringifyWithBigInt(event));
    const result = MonitorQueueEventSchema.safeParse(wire);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.schedulerBatchId).toBe("bigint");
      expect(result.data.runAt).toBeInstanceOf(Date);
      expect(result.data.window).toBe("5m");
    }
  });

  it("round-trips a MonitorWebhookQueueEvent envelope through JSON", () => {
    const envelope = {
      type: "monitor-alert" as const,
      version: "v1" as const,
      payload: {
        monitorId: "mon_01",
        projectId: "proj_01",
        severity: "ALERT" as const,
        permalink: "https://cloud.langfuse.com/project/proj_01/monitors/mon_01",
        timestamp: new Date("2026-05-18T12:01:00.000Z"),
        message: { title: "High error rate", body: "errors > 100" },
        view: "observations" as const,
        filters: [],
        window: "5m" as const,
      },
    };
    const wire = JSON.parse(stringifyWithBigInt(envelope));
    const result = MonitorWebhookQueueEventSchema.safeParse(wire);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.payload.timestamp).toBeInstanceOf(Date);
    }
  });
});
