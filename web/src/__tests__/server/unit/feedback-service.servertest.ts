import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LangfuseConflictError,
  ServiceUnavailableError,
} from "@langfuse/shared";
import type { ApiAccessScope } from "@langfuse/shared/src/server";
import type * as SharedServer from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";

const { mockRateLimitRequest, mockRecordIncrement, mockLoggerWarn } =
  vi.hoisted(() => ({
    mockRateLimitRequest: vi.fn(),
    mockRecordIncrement: vi.fn(),
    mockLoggerWarn: vi.fn(),
  }));

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual<typeof SharedServer>(
    "@langfuse/shared/src/server",
  );
  return {
    ...actual,
    recordIncrement: mockRecordIncrement,
    logger: Object.assign(Object.create(actual.logger), {
      warn: mockLoggerWarn,
    }),
  };
});

vi.mock("@/src/features/public-api/server/RateLimitService", () => ({
  RateLimitService: {
    getInstance: () => ({
      rateLimitRequest: mockRateLimitRequest,
    }),
  },
}));

import { submitFeedback } from "@/src/features/feedback/server/FeedbackService";
import { PostFeedbackBody } from "@/src/features/public-api/types/feedback";

const scope = {
  projectId: "project-1",
  orgId: "org-1",
  accessLevel: "project",
  plan: "cloud:pro",
  rateLimitOverrides: [],
  apiKeyId: "api-key-1",
  publicKey: "pk-test",
  isIngestionSuspended: false,
} as ApiAccessScope;

type SlackBlockForTest = {
  type?: string;
  text?: {
    type?: string;
    text?: string;
  };
  fields?: Array<{ type?: string; text?: string }>;
  elements?: Array<{ type?: string; text?: string }>;
};

describe("FeedbackService", () => {
  const originalWebhookUrl = env.LANGFUSE_FEEDBACK_INTAKE_SLACK_WEBHOOK;
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  const originalNodeEnv = env.NODE_ENV;

  beforeEach(() => {
    mockRateLimitRequest.mockReset();
    mockRateLimitRequest.mockResolvedValue(undefined);
    mockRecordIncrement.mockReset();
    mockLoggerWarn.mockReset();
    (env as any).LANGFUSE_FEEDBACK_INTAKE_SLACK_WEBHOOK =
      "https://hooks.slack.com/services/test";
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    (env as any).LANGFUSE_FEEDBACK_INTAKE_SLACK_WEBHOOK = originalWebhookUrl;
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
    (env as any).NODE_ENV = originalNodeEnv;
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

    const result = await submitFeedback({
      scope,
      input,
      source: "langfuse-mcp",
    });

    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(mockRateLimitRequest).toHaveBeenCalledWith(scope, "feedback");
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
    expect(body.text).toBe(
      `New Langfuse feedback · Langfuse MCP · mcp-tool · ${result.id}`,
    );
    expect(body.unfurl_links).toBe(false);
    expect(body.unfurl_media).toBe(false);
    expect(
      body.blocks.at(-1)?.elements?.map((element) => element.text),
    ).toEqual([
      `🧾 Receipt: ${result.id}`,
      "🏢 Org: org-1",
      "📁 Project: project-1",
    ]);

    // User-authored text must stay plain_text so mentions cannot ping.
    const feedbackBlock = body.blocks.find(
      (block) =>
        block.type === "section" &&
        block.text?.type === "plain_text" &&
        block.text.text?.includes("@here"),
    );
    expect(feedbackBlock).toBeTruthy();

    await expect(
      submitFeedback({ scope, input, source: "langfuse-mcp" }),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
    await expect(
      submitFeedback({ scope, input, source: "langfuse-mcp" }),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it("rejects unsafe reference URLs at the schema boundary", () => {
    expect(
      PostFeedbackBody.safeParse({
        targetType: "docs",
        target: "/docs/mcp",
        feedback: "Please clarify setup.",
        referenceUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });

  it("rejects insecure Slack sinks in production", async () => {
    (env as any).NODE_ENV = "production";
    (env as any).LANGFUSE_FEEDBACK_INTAKE_SLACK_WEBHOOK =
      "http://hooks.slack.com/services/test";

    await expect(
      submitFeedback({
        scope,
        input: {
          targetType: "docs",
          target: "/docs/mcp",
          feedback: "Please clarify setup.",
        },
        source: "public-api",
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it("throws a 429 when the org feedback rate limit is exhausted", async () => {
    mockRateLimitRequest.mockResolvedValueOnce({
      isRateLimited: () => true,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitFeedback({
        scope,
        input: {
          targetType: "docs",
          target: "/docs/mcp",
          feedback: "Please clarify setup.",
        },
        source: "public-api",
      }),
    ).rejects.toMatchObject({ httpCode: 429 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockRecordIncrement).toHaveBeenCalledWith(
      "langfuse.feedback.submission",
      1,
      { source: "public-api", outcome: "rate_limited" },
    );
  });

  it("returns a sanitized conflict when the Slack sink is not configured", async () => {
    (env as any).LANGFUSE_FEEDBACK_INTAKE_SLACK_WEBHOOK = undefined;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const input = {
      targetType: "docs" as const,
      target: "sensitive-target",
      feedback: "sensitive-feedback",
      goal: "sensitive-goal",
      referenceUrl: "https://example.com/sensitive-reference",
    };

    await expect(
      submitFeedback({ scope, input, source: "public-api" }),
    ).rejects.toEqual(
      new LangfuseConflictError(
        "Feedback submission is not configured for this deployment",
      ),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockRecordIncrement).toHaveBeenCalledWith(
      "langfuse.feedback.submission",
      1,
      { source: "public-api", outcome: "sink_unconfigured" },
    );
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "Feedback intake sink is not configured",
      {
        source: "public-api",
        targetType: "docs",
        orgId: "org-1",
        projectId: "project-1",
        region: "self-hosted",
      },
    );
    expect(JSON.stringify(mockLoggerWarn.mock.calls)).not.toContain(
      "sensitive-feedback",
    );
    expect(JSON.stringify(mockLoggerWarn.mock.calls)).not.toContain(
      "sensitive-target",
    );
  });

  it("never delivers to Slack in the HIPAA region even with a configured sink", async () => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "HIPAA";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitFeedback({
        scope,
        input: {
          targetType: "docs",
          target: "/docs/mcp",
          feedback: "Please clarify setup.",
        },
        source: "public-api",
      }),
    ).rejects.toBeInstanceOf(LangfuseConflictError);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockRecordIncrement).toHaveBeenCalledWith(
      "langfuse.feedback.submission",
      1,
      { source: "public-api", outcome: "sink_unconfigured" },
    );
  });
});
