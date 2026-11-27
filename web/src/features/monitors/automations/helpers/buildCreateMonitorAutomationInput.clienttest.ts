import { describe, expect, it } from "vitest";

import { buildCreateMonitorAutomationInput } from "./buildCreateMonitorAutomationInput";
import {
  defaultMonitorAutomationFormValues,
  monitorAutomationFormSchema,
} from "./monitorAutomationFormSchema";

describe("buildCreateMonitorAutomationInput", () => {
  it("creates an active monitor automation posting to the https URL with named headers", () => {
    const values = {
      ...defaultMonitorAutomationFormValues("WEBHOOK", " Staging alerts "),
      webhook: {
        url: "example.com/hook",
        headers: [
          { name: " x-team ", value: " ml ", isSecret: false },
          { name: "authorization", value: "Bearer t", isSecret: true },
          { name: "", value: "", isSecret: false },
        ],
      },
    };

    expect(buildCreateMonitorAutomationInput("p1", values)).toEqual({
      projectId: "p1",
      name: "Staging alerts",
      eventSource: "monitor",
      eventAction: [],
      filter: null,
      status: "ACTIVE",
      actionType: "WEBHOOK",
      actionConfig: {
        type: "WEBHOOK",
        url: "https://example.com/hook",
        requestHeaders: {
          "x-team": { secret: false, value: "ml" },
          authorization: { secret: true, value: "Bearer t" },
        },
        apiVersion: { monitor: "v1" },
      },
    });
  });

  it("dispatches to the https URL for the host and path typed after the prefix", () => {
    const values = {
      ...defaultMonitorAutomationFormValues("GITHUB_DISPATCH", "Deploy"),
      githubDispatch: {
        url: " api.github.com/repos/o/r/dispatches ",
        eventType: "langfuse-alert",
        githubToken: "ghp_token",
      },
    };

    expect(
      buildCreateMonitorAutomationInput("p1", values).actionConfig,
    ).toEqual({
      type: "GITHUB_DISPATCH",
      url: "https://api.github.com/repos/o/r/dispatches",
      eventType: "langfuse-alert",
      githubToken: "ghp_token",
    });
  });
});

describe("monitorAutomationFormSchema", () => {
  it("rejects a webhook host that does not form a valid URL", () => {
    const values = {
      ...defaultMonitorAutomationFormValues("WEBHOOK", "Hook"),
      webhook: { url: "not a host", headers: [] },
    };

    const result = monitorAutomationFormSchema.safeParse(values);

    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ["webhook", "url"],
        message: "Enter a valid HTTPS URL.",
      }),
    ]);
  });

  it.each(["my_service.internal/hook", "[2001:db8::1]/hook"])(
    "accepts the webhook host %s, which the server also accepts",
    (url) => {
      const values = {
        ...defaultMonitorAutomationFormValues("WEBHOOK", "Hook"),
        webhook: { url, headers: [] },
      };

      expect(monitorAutomationFormSchema.safeParse(values).success).toBe(true);
    },
  );

  it("rejects a custom header that overrides a Langfuse header", () => {
    const values = {
      ...defaultMonitorAutomationFormValues("WEBHOOK", "Hook"),
      webhook: {
        url: "example.com",
        headers: [
          { name: "Content-Type", value: "text/plain", isSecret: false },
        ],
      },
    };

    const result = monitorAutomationFormSchema.safeParse(values);

    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ["webhook", "headers", 0, "name"] }),
    ]);
  });

  it("ignores the fields of actions other than the selected one", () => {
    const values = {
      ...defaultMonitorAutomationFormValues("SLACK", "Slack"),
      webhook: { url: "not a host", headers: [] },
    };

    expect(monitorAutomationFormSchema.safeParse(values).success).toBe(true);
  });
});
