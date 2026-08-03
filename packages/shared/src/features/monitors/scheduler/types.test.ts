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
    publishedAt: new Date("2026-05-18T12:00:00.500Z"),
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

  it("preserves full precision when coercing a large bigint string wire value", () => {
    const huge = 123456789012345678901234567890n;
    const result = MonitorQueueEventSchema.safeParse({
      ...validQueueEvent,
      schedulerBatchId: huge.toString(),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.schedulerBatchId).toBe("bigint");
      expect(result.data.schedulerBatchId).toBe(huge);
    }
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
    expect(
      MonitorQueueEventSchema.safeParse({
        ...validQueueEvent,
        schedulerBatchId: -1n,
      }).success,
    ).toBe(false);
  });

  it("accepts zero as a schedulerBatchId", () => {
    expect(
      MonitorQueueEventSchema.safeParse({
        ...validQueueEvent,
        schedulerBatchId: 0n,
      }).success,
    ).toBe(true);
  });

  it("accepts an empty monitors array", () => {
    expect(
      MonitorQueueEventSchema.safeParse({ ...validQueueEvent, monitors: [] })
        .success,
    ).toBe(true);
  });
});

describe("MonitorWebhookQueueEventSchema", () => {
  const validEnvelope = {
    id: "exe_01",
    timestamp: new Date("2026-05-18T12:01:00.000Z"),
    type: "monitor-alert" as const,
    apiVersion: "v1" as const,
    payload: {
      monitorId: "mon_01",
      projectId: "proj_01",
      severity: "ALERT" as const,
      permalink: "https://cloud.langfuse.com/project/proj_01/monitors/mon_01",
      timestamp: new Date("2026-05-18T12:01:00.000Z"),
      fromTimestamp: new Date("2026-05-18T11:55:30.000Z"),
      toTimestamp: new Date("2026-05-18T12:00:30.000Z"),
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

  it("rejects a wrong apiVersion literal", () => {
    expect(
      MonitorWebhookQueueEventSchema.safeParse({
        ...validEnvelope,
        apiVersion: "v2",
      }).success,
    ).toBe(false);
  });

  it("requires id", () => {
    const { id: _unused, ...withoutId } = validEnvelope;
    expect(MonitorWebhookQueueEventSchema.safeParse(withoutId).success).toBe(
      false,
    );
  });

  it("requires timestamp", () => {
    const { timestamp: _unused, ...withoutTs } = validEnvelope;
    expect(MonitorWebhookQueueEventSchema.safeParse(withoutTs).success).toBe(
      false,
    );
  });

  it("coerces a string timestamp to a Date", () => {
    const result = MonitorWebhookQueueEventSchema.safeParse({
      ...validEnvelope,
      timestamp: "2026-05-18T12:01:00.000Z",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.timestamp).toBeInstanceOf(Date);
  });
});

describe("scheduler DTO JSON round-trip (wire contract)", () => {
  const stringifyWithBigInt = (value: unknown) =>
    JSON.stringify(value, (_key, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );

  it("round-trips a MonitorQueueEvent through JSON", () => {
    const event = {
      projectId: "proj_01",
      schedulerBatchId: 42n,
      runAt: new Date("2026-05-18T12:00:00.000Z"),
      publishedAt: new Date("2026-05-18T12:00:00.500Z"),
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
      id: "exe_01",
      timestamp: new Date("2026-05-18T12:01:00.000Z"),
      type: "monitor-alert" as const,
      apiVersion: "v1" as const,
      payload: {
        monitorId: "mon_01",
        projectId: "proj_01",
        severity: "ALERT" as const,
        permalink: "https://cloud.langfuse.com/project/proj_01/monitors/mon_01",
        timestamp: new Date("2026-05-18T12:01:00.000Z"),
        fromTimestamp: new Date("2026-05-18T11:55:30.000Z"),
        toTimestamp: new Date("2026-05-18T12:00:30.000Z"),
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
      expect(result.data.timestamp).toBeInstanceOf(Date);
      expect(result.data.payload.timestamp).toBeInstanceOf(Date);
    }
  });
});
