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
    projectName: "My Project",
    resourceId: "proj_1",
    resourceName: "my-export-bucket",
    message: "Blob storage export failed.",
    url: "https://cloud.langfuse.com/project/proj_1/settings",
  },
};

const evaluatorBlockedEvent = {
  eventType: "evaluator-blocked" as const,
  severity: "ALERT" as const,
  projectId: "proj_1",
  projectName: "My Project",
  resourceId: "cfg_1",
  resourceName: "Toxicity",
  message: "Evaluator was blocked.",
  url: "https://cloud.langfuse.com/project/proj_1/evals",
  blockReason: "LLM_CONNECTION_MISSING" as const,
  evalTemplateId: "tpl_1",
};

describe("ProjectNotificationWebhookQueueEventSchema", () => {
  it("parses a valid envelope and coerces the timestamp", () => {
    const parsed =
      ProjectNotificationWebhookQueueEventSchema.parse(validEnvelope);
    expect(parsed.event.eventType).toBe("blob-export-failed");
    expect(parsed.timestamp).toBeInstanceOf(Date);
  });

  it("parses the evaluator-blocked variant with its typed blockReason", () => {
    const parsed = ProjectNotificationWebhookQueueEventSchema.parse({
      ...validEnvelope,
      event: evaluatorBlockedEvent,
    });
    if (parsed.event.eventType !== "evaluator-blocked") {
      throw new Error("expected evaluator-blocked variant");
    }
    expect(parsed.event.blockReason).toBe("LLM_CONNECTION_MISSING");
    expect(parsed.event.evalTemplateId).toBe("tpl_1");
  });

  it("rejects an evaluator-blocked event without blockReason", () => {
    const { blockReason: _blockReason, ...event } = evaluatorBlockedEvent;
    expect(
      ProjectNotificationWebhookQueueEventSchema.safeParse({
        ...validEnvelope,
        event,
      }).success,
    ).toBe(false);
  });

  it("rejects an event without projectName", () => {
    const { projectName: _projectName, ...event } = validEnvelope.event;
    expect(
      ProjectNotificationWebhookQueueEventSchema.safeParse({
        ...validEnvelope,
        event,
      }).success,
    ).toBe(false);
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
