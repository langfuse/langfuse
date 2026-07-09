import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceUnavailableError } from "@langfuse/shared/src/errors";
import { env } from "@/src/env.mjs";
import { submitFeedback } from "@/src/features/feedback/server/FeedbackService";

const authScope = {
  projectId: "project-1",
  orgId: "org-1",
};

type SlackBlockForTest = {
  type?: string;
  text?: {
    type?: string;
    text?: string;
  };
};

describe("FeedbackService", () => {
  const originalWebhookUrl = env.LANGFUSE_FEEDBACK_INTAKE_SLACK_WEBHOOK;
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  beforeEach(() => {
    (env as any).LANGFUSE_FEEDBACK_INTAKE_SLACK_WEBHOOK =
      "https://hooks.slack.com/services/test";
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    (env as any).LANGFUSE_FEEDBACK_INTAKE_SLACK_WEBHOOK = originalWebhookUrl;
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
  });

  it("posts a Slack-safe payload and maps sink failures to service unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(new Response("error", { status: 500 }))
      .mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);

    const input = {
      targetType: "mcp-tool" as const,
      target: "submitFeedback",
      feedback:
        "This mentions @here and <!channel> and <https://example.com|link>.",
      goal: "Help improve feedback guidance without alerting the channel.",
      referenceUrl: "https://example.com/reference",
    };

    const result = await submitFeedback({ authScope, input });

    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/test",
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
      }),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      text: string;
      unfurl_links: boolean;
      unfurl_media: boolean;
      blocks: SlackBlockForTest[];
    };
    expect(body.text).toBe(`New Langfuse feedback ${result.id}`);
    expect(body.text).not.toContain("@here");
    expect(body.unfurl_links).toBe(false);
    expect(body.unfurl_media).toBe(false);

    const feedbackBlock = body.blocks.find(
      (block) =>
        block.type === "section" &&
        block.text?.type === "plain_text" &&
        block.text.text.includes("@here"),
    );
    expect(feedbackBlock).toBeTruthy();

    await expect(submitFeedback({ authScope, input })).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
    await expect(submitFeedback({ authScope, input })).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
  });
});
