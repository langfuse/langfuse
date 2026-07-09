import { describe, it, expect } from "vitest";

import { WebhookOutboundEnvelopeSchema } from "../queues";
import { ProjectNotificationWebhookQueueEventSchema } from "./types";

const validEnvelope = {
  id: "exec_1",
  timestamp: "2026-07-08T00:00:00.000Z",
  type: "project-notification" as const,
  apiVersion: "v1" as const,
  event: {
    eventType: "blob-export-failed" as const,
    severity: "ALERT" as const,
    projectId: "proj_1",
    resourceId: "res_1",
    resourceName: "My Project",
    message: "Blob storage export failed.",
    url: "https://cloud.langfuse.com/project/proj_1/settings",
  },
};

describe("ProjectNotificationWebhookQueueEventSchema", () => {
  it("parses a valid envelope and coerces the timestamp", () => {
    const parsed =
      ProjectNotificationWebhookQueueEventSchema.parse(validEnvelope);
    expect(parsed.event.eventType).toBe("blob-export-failed");
    expect(parsed.timestamp).toBeInstanceOf(Date);
  });

  it("allows a missing url (unset NEXTAUTH_URL)", () => {
    const { url: _url, ...event } = validEnvelope.event;
    expect(
      ProjectNotificationWebhookQueueEventSchema.safeParse({
        ...validEnvelope,
        event,
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown event type", () => {
    expect(
      ProjectNotificationWebhookQueueEventSchema.safeParse({
        ...validEnvelope,
        event: { ...validEnvelope.event, eventType: "not-an-event" },
      }).success,
    ).toBe(false);
  });

  it("rejects an out-of-vocabulary severity", () => {
    expect(
      ProjectNotificationWebhookQueueEventSchema.safeParse({
        ...validEnvelope,
        event: { ...validEnvelope.event, severity: "OK" },
      }).success,
    ).toBe(false);
  });
});

describe("WebhookOutboundEnvelopeSchema discrimination", () => {
  it("accepts the project-notification variant", () => {
    const parsed = WebhookOutboundEnvelopeSchema.parse(validEnvelope);
    expect(parsed.type).toBe("project-notification");
  });
});
