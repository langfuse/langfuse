import { describe, it, expect } from "vitest";

import { MonitorWindow } from "../features/monitor";
import { MonitorAlertWebhookOutboundSchema } from "./webhooks";

describe("MonitorAlertWebhookOutboundSchema", () => {
  const validOutbound = {
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
      message: { title: "High error rate", body: "errors > 100" },
      view: "OBSERVATIONS" as const,
      filters: [],
      window: MonitorWindow.FIVE_MIN,
    },
  };

  it("round-trips a valid outbound payload", () => {
    const parsed = MonitorAlertWebhookOutboundSchema.safeParse(validOutbound);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe("monitor-alert");
      expect(parsed.data.apiVersion).toBe("v1");
      expect(parsed.data.payload.monitorId).toBe("mon_01");
    }
  });

  it("rejects a wrong type discriminator", () => {
    expect(
      MonitorAlertWebhookOutboundSchema.safeParse({
        ...validOutbound,
        type: "prompt-version",
      }).success,
    ).toBe(false);
  });

  it("rejects a wrong apiVersion", () => {
    expect(
      MonitorAlertWebhookOutboundSchema.safeParse({
        ...validOutbound,
        apiVersion: "v2",
      }).success,
    ).toBe(false);
  });
});
