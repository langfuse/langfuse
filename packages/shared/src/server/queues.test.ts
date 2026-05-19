import { describe, it, expect } from "vitest";

import { MonitorWindow } from "../features/monitor";
import { WebhookOutboundEnvelopeSchema } from "./queues";

describe("WebhookOutboundEnvelopeSchema", () => {
  const validPromptEnvelope = {
    type: "prompt-version" as const,
    action: "created" as const,
    prompt: {
      id: "p_01",
      name: "faq-bot",
      version: 1,
      createdAt: new Date("2026-05-18T00:00:00.000Z"),
      updatedAt: new Date("2026-05-18T00:00:00.000Z"),
      createdBy: "u_01",
      isActive: true,
      tags: [],
      labels: [],
      prompt: null,
      config: null,
      projectId: "proj_01",
      commitMessage: null,
    },
  };

  const validMonitorEnvelope = {
    type: "monitor-alert" as const,
    version: "v1" as const,
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

  it("parses a valid prompt-version envelope", () => {
    const parsed = WebhookOutboundEnvelopeSchema.safeParse(validPromptEnvelope);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe("prompt-version");
    }
  });

  it("parses a valid monitor-alert envelope", () => {
    const parsed =
      WebhookOutboundEnvelopeSchema.safeParse(validMonitorEnvelope);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.type).toBe("monitor-alert");
    }
  });

  it("rejects an envelope with an unknown type", () => {
    expect(
      WebhookOutboundEnvelopeSchema.safeParse({
        ...validPromptEnvelope,
        type: "bogus",
      }).success,
    ).toBe(false);
  });
});
