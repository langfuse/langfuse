import { describe, it, expect } from "vitest";

import {
  IngestionEvent,
  OtelIngestionEvent,
  WebhookOutboundEnvelopeSchema,
} from "./queues";

const validMonitorEnvelope = {
  id: "exe_01",
  timestamp: new Date("2026-05-18T12:01:00.000Z"),
  type: "monitor-alert" as const,
  apiVersion: "v1" as const,
  payload: {
    monitorId: "mon_01",
    projectId: "proj_01",
    permalink: "https://cloud.langfuse.com/project/proj_01/monitors/mon_01",
    message: { title: "[ALERT] err", body: "errors > 100" },
    severity: "ALERT" as const,
    timestamp: new Date("2026-05-18T12:01:00.000Z"),
    fromTimestamp: new Date("2026-05-18T11:55:30.000Z"),
    toTimestamp: new Date("2026-05-18T12:00:30.000Z"),
    view: "observations" as const,
    filters: [],
    window: "5m" as const,
  },
};

describe("WebhookOutboundEnvelopeSchema (discriminated union)", () => {
  it("parses a monitor-alert envelope", () => {
    const parsed =
      WebhookOutboundEnvelopeSchema.safeParse(validMonitorEnvelope);
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.type === "monitor-alert") {
      expect(parsed.data.payload.severity).toBe("ALERT");
    }
  });

  it("rejects an unknown discriminator", () => {
    expect(
      WebhookOutboundEnvelopeSchema.safeParse({ type: "bogus" }).success,
    ).toBe(false);
  });

  it("rejects a monitor-alert envelope with missing payload", () => {
    const { payload: _unused, ...withoutPayload } = validMonitorEnvelope;
    expect(
      WebhookOutboundEnvelopeSchema.safeParse(withoutPayload).success,
    ).toBe(false);
  });
});

describe("ingestion queue payload compatibility", () => {
  it("accepts ingestion jobs created before attribution fields existed", () => {
    const parsed = IngestionEvent.safeParse({
      data: {
        type: "trace-create",
        eventBodyId: "trace-01",
        fileKey: "event-01",
      },
      authCheck: {
        validKey: true,
        scope: {
          projectId: "project-01",
        },
      },
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts otel jobs with omitted attribution fields", () => {
    const parsed = OtelIngestionEvent.safeParse({
      data: {
        fileKey: "otel-01",
      },
      authCheck: {
        validKey: true,
        scope: {
          projectId: "project-01",
          accessLevel: "project",
        },
      },
    });

    expect(parsed.success).toBe(true);
  });
});
