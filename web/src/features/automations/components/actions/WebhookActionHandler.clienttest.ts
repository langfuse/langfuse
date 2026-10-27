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

describe("WebhookActionHandler.validateFormData URL changes", () => {
  const storedSecretHeader = {
    name: "x-api-key",
    value: "",
    displayValue: "secr...-123",
    isSecret: true,
    wasSecret: true,
  };

  const validate = (url: string, value = "") =>
    handler.validateFormData({
      webhook: {
        url,
        headers: [{ ...storedSecretHeader, value }],
        apiVersion: { prompt: "v1" },
        originalUrl: "https://example.com/hook",
      },
    });

  it("requires stored secret headers to be re-entered when the URL changes", () => {
    expect(validate("https://example.org/hook").errors).toEqual([
      "Header 1: Re-enter the secret value when changing the webhook URL",
    ]);
  });

  it("accepts a URL change with the secret re-entered", () => {
    expect(validate("https://example.org/hook", "new-key").isValid).toBe(true);
  });

  it("keeps stored secrets when the URL is unchanged", () => {
    expect(validate("https://EXAMPLE.com/hook").isValid).toBe(true);
  });
});
