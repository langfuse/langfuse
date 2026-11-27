// @vitest-environment node

import { describe, expect, it } from "vitest";

import { TriggerEventSource } from "@langfuse/shared";
import { WebhookActionHandler } from "./WebhookActionHandler";

const handler = new WebhookActionHandler();

const formData = {
  webhook: {
    url: "https://example.com/hook",
    headers: [],
  },
};

const apiVersionFor = (eventSource?: TriggerEventSource) => {
  const config = handler.buildActionConfig(formData, eventSource);
  if (config.type !== "WEBHOOK") throw new Error("expected webhook config");
  return config.apiVersion;
};

// apiVersion is not user-editable; it is derived from the trigger's event
// source at submit time so it cannot drift when the source changes.
describe("WebhookActionHandler.buildActionConfig apiVersion", () => {
  it("monitor source: derives { monitor: v1 }", () => {
    expect(apiVersionFor(TriggerEventSource.Monitor)).toEqual({
      monitor: "v1",
    });
  });

  it("prompt source: derives { prompt: v1 }", () => {
    expect(apiVersionFor(TriggerEventSource.Prompt)).toEqual({ prompt: "v1" });
  });

  it("project-notification source: derives { project-notification: v1 }", () => {
    expect(apiVersionFor(TriggerEventSource.ProjectNotification)).toEqual({
      "project-notification": "v1",
    });
  });

  it("no eventSource: falls back to { prompt: v1 }", () => {
    expect(apiVersionFor(undefined)).toEqual({ prompt: "v1" });
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
