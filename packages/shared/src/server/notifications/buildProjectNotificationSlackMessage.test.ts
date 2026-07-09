import { describe, it, expect } from "vitest";

import { buildProjectNotificationSlackMessage } from "./buildProjectNotificationSlackMessage";
import { type ProjectNotificationEvent } from "./types";

const baseEvent: ProjectNotificationEvent = {
  eventType: "evaluator-blocked",
  severity: "ALERT",
  projectId: "proj_1",
  resourceId: "cfg_1",
  resourceName: "Toxicity",
  message: "Evaluator was blocked due to an invalid model config.",
  url: "https://cloud.langfuse.com/project/proj_1/evals",
};

describe("buildProjectNotificationSlackMessage", () => {
  it("renders a severity-colored attachment with a human title and the message body", () => {
    const message = buildProjectNotificationSlackMessage(baseEvent);
    expect(message.blocks).toEqual([]);
    expect(message.attachments).toHaveLength(1);
    const attachment = message.attachments![0];
    expect(attachment.color).toBe("#dc3545"); // ALERT
    const serialized = JSON.stringify(attachment.blocks);
    expect(serialized).toContain("Evaluator blocked: Toxicity");
    expect(serialized).toContain("invalid model config");
    // deep-link button present when url is set
    expect(serialized).toContain(baseEvent.url);
  });

  it("renders INFO with a neutral color, not the monitor OK green", () => {
    const message = buildProjectNotificationSlackMessage({
      ...baseEvent,
      severity: "INFO",
    });
    expect(message.attachments![0].color).toBe("#6c757d");
  });

  it("omits the link button when no url is provided", () => {
    const { url: _url, ...event } = baseEvent;
    const message = buildProjectNotificationSlackMessage(event);
    const serialized = JSON.stringify(message.attachments![0].blocks);
    expect(serialized).not.toContain("View in Langfuse");
  });
});
