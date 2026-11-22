import { describe, expect, it } from "vitest";

import { serverErrorField } from "./serverErrorField";

describe("serverErrorField", () => {
  it.each([
    [
      "GITHUB_DISPATCH",
      "Invalid webhook URL: DNS lookup failed for kjhkjhkj.com",
      "githubDispatch.url",
    ],
    [
      "GITHUB_DISPATCH",
      "GitHub Personal Access Token is required",
      "githubDispatch.githubToken",
    ],
    ["WEBHOOK", "Invalid webhook URL: blocked host", "webhook.url"],
    [
      "WEBHOOK",
      'Secret header "x" must be re-entered when changing the webhook URL',
      "root.server",
    ],
    [
      "SLACK",
      "Send a test message to this channel before saving so it can be resolved.",
      "slack.channelId",
    ],
    ["PAGERDUTY", "Something unexpected", "root.server"],
  ] as const)(
    "shows a %s rejection %j under %s",
    (actionType, message, field) => {
      expect(serverErrorField(actionType, message)).toBe(field);
    },
  );
});
