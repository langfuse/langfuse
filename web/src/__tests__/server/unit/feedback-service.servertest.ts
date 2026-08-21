import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LangfuseConflictError,
  ServiceUnavailableError,
} from "@langfuse/shared";
import type { ApiAccessScope } from "@langfuse/shared/src/server";
import type * as SharedServer from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";

const {
  mockRateLimitRequest,
  mockRecordIncrement,
  mockLoggerWarn,
  mockOrgFindUnique,
  mockProjectFindFirst,
} = vi.hoisted(() => ({
  mockRateLimitRequest: vi.fn(),
  mockRecordIncrement: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockOrgFindUnique: vi.fn(),
  mockProjectFindFirst: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async () => {
  const actual = await vi.importActual<typeof SharedServer>(
    "@langfuse/shared/src/server",
  );
  return {
    ...actual,
    recordIncrement: mockRecordIncrement,
    getProductBaseUrl: () => new URL("https://cloud.langfuse.com/"),
    logger: Object.assign(Object.create(actual.logger), {
      warn: mockLoggerWarn,
    }),
  };
});

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    organization: {
      findUnique: mockOrgFindUnique,
    },
    project: {
      findFirst: mockProjectFindFirst,
    },
  },
}));

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
    mockOrgFindUnique.mockReset();
    mockProjectFindFirst.mockReset();
    mockOrgFindUnique.mockResolvedValue(null);
    mockProjectFindFirst.mockResolvedValue(null);
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
    expect(JSON.stringify(body.blocks)).not.toContain("REPORTER");

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
    expect(mockOrgFindUnique).not.toHaveBeenCalled();
    expect(mockProjectFindFirst).not.toHaveBeenCalled();
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
    expect(mockOrgFindUnique).not.toHaveBeenCalled();
    expect(mockProjectFindFirst).not.toHaveBeenCalled();
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

  it("includes the reporter in Slack for in-app assistant feedback", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitFeedback({
      scope,
      input: {
        targetType: "mcp-tool" as const,
        target: "submitFeedback",
        feedback: "The traces table filter is confusing.",
      },
      source: "in-app-assistant",
      reporter: {
        userId: "user-1",
        email: "ugeon.jeon@creverse.com",
      },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      text: string;
      blocks: SlackBlockForTest[];
    };
    expect(body.text).toBe(
      `New Langfuse feedback · In-app assistant · mcp-tool · ${result.id}`,
    );

    const fieldTexts =
      body.blocks
        .find((block) => Array.isArray(block.fields))
        ?.fields?.map((field) => field.text) ?? [];
    expect(fieldTexts).toEqual(
      expect.arrayContaining([
        "📬 SOURCE:\nIn-app assistant",
        "👤 REPORTER:\nuser-1 · ugeon.jeon@creverse.com",
      ]),
    );
  });

  it("does not log reporter PII when the Slack sink is not configured", async () => {
    (env as any).LANGFUSE_FEEDBACK_INTAKE_SLACK_WEBHOOK = undefined;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      submitFeedback({
        scope,
        input: {
          targetType: "docs" as const,
          target: "/docs/mcp",
          feedback: "Please clarify setup.",
        },
        source: "in-app-assistant",
        reporter: {
          userId: "user-1",
          email: "reporter@example.com",
        },
      }),
    ).rejects.toBeInstanceOf(LangfuseConflictError);

    expect(JSON.stringify(mockLoggerWarn.mock.calls)).not.toContain(
      "reporter@example.com",
    );
  });

  it("enriches Slack context with org and project names and product links", async () => {
    mockOrgFindUnique.mockResolvedValueOnce({ name: "Acme <Corp>" });
    mockProjectFindFirst.mockResolvedValueOnce({ name: "Production" });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitFeedback({
      scope,
      input: {
        targetType: "docs" as const,
        target: "/docs/mcp",
        feedback: "Please clarify setup.",
      },
      source: "langfuse-mcp",
    });

    expect(mockOrgFindUnique).toHaveBeenCalledWith({
      where: { id: "org-1" },
      select: { name: true },
    });
    expect(mockProjectFindFirst).toHaveBeenCalledWith({
      where: { id: "project-1", orgId: "org-1" },
      select: { name: true },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      blocks: SlackBlockForTest[];
    };
    expect(body.blocks.at(-1)?.elements).toEqual([
      expect.objectContaining({
        type: "plain_text",
        text: `🧾 Receipt: ${result.id}`,
      }),
      expect.objectContaining({
        type: "mrkdwn",
        text: "🏢 Org: Acme &lt;Corp&gt; · <https://cloud.langfuse.com/organization/org-1|org-1>",
      }),
      expect.objectContaining({
        type: "mrkdwn",
        text: "📁 Project: Production · <https://cloud.langfuse.com/project/project-1|project-1>",
      }),
    ]);
  });

  it("skips project lookup when the scope has no project id", async () => {
    mockOrgFindUnique.mockResolvedValueOnce({ name: "Acme Corp" });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitFeedback({
      scope: { ...scope, projectId: null },
      input: {
        targetType: "docs" as const,
        target: "/docs/mcp",
        feedback: "Please clarify setup.",
      },
      source: "public-api",
    });

    expect(mockProjectFindFirst).not.toHaveBeenCalled();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      blocks: SlackBlockForTest[];
    };
    expect(body.blocks.at(-1)?.elements).toEqual([
      expect.objectContaining({
        type: "plain_text",
        text: `🧾 Receipt: ${result.id}`,
      }),
      expect.objectContaining({
        type: "mrkdwn",
        text: "🏢 Org: Acme Corp · <https://cloud.langfuse.com/organization/org-1|org-1>",
      }),
      expect.objectContaining({
        type: "plain_text",
        text: "📁 Project: unknown",
      }),
    ]);
  });

  it("falls back to plain org and project ids when lookup fails", async () => {
    mockOrgFindUnique.mockRejectedValueOnce(new Error("db unavailable"));
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitFeedback({
      scope,
      input: {
        targetType: "docs" as const,
        target: "/docs/mcp",
        feedback: "Please clarify setup.",
      },
      source: "langfuse-mcp",
    });

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "Failed to resolve feedback org/project names",
      expect.objectContaining({
        orgId: "org-1",
        projectId: "project-1",
      }),
    );

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      blocks: SlackBlockForTest[];
    };
    expect(
      body.blocks.at(-1)?.elements?.map((element) => element.text),
    ).toEqual([
      `🧾 Receipt: ${result.id}`,
      "🏢 Org: org-1",
      "📁 Project: project-1",
    ]);
  });
});
