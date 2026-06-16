import { describe, expect, it } from "vitest";

import { type AutomationDomain, TriggerEventSource } from "@langfuse/shared";
import { WebhookActionHandler } from "./WebhookActionHandler";

const handler = new WebhookActionHandler();

const webhookAutomation = (
  apiVersion: Record<string, "v1">,
): AutomationDomain =>
  ({
    id: "automation-1",
    name: "test",
    trigger: {
      id: "trigger-1",
      eventSource: TriggerEventSource.Monitor,
      eventActions: ["created"],
      filter: [],
      status: "ACTIVE",
    },
    action: {
      id: "action-1",
      type: "WEBHOOK",
      config: {
        type: "WEBHOOK",
        url: "https://example.com",
        apiVersion,
        displaySecretKey: "sk_...abcd",
      },
    },
  }) as unknown as AutomationDomain;

describe("WebhookActionHandler.getDefaultValues", () => {
  it("monitor-source new automation: seeds apiVersion { monitor: v1 }", () => {
    expect(
      handler.getDefaultValues(undefined, TriggerEventSource.Monitor).webhook
        .apiVersion,
    ).toEqual({ monitor: "v1" });
  });

  it("prompt-source new automation: seeds apiVersion { prompt: v1 }", () => {
    expect(
      handler.getDefaultValues(undefined, TriggerEventSource.Prompt).webhook
        .apiVersion,
    ).toEqual({ prompt: "v1" });
  });

  it("no eventSource: seeds apiVersion { prompt: v1 }", () => {
    expect(handler.getDefaultValues(undefined).webhook.apiVersion).toEqual({
      prompt: "v1",
    });
  });

  it("editing existing config: stored apiVersion wins over eventSource", () => {
    expect(
      handler.getDefaultValues(
        webhookAutomation({ monitor: "v1" }),
        TriggerEventSource.Prompt,
      ).webhook.apiVersion,
    ).toEqual({ monitor: "v1" });
  });
});
