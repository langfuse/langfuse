import { randomUUID } from "node:crypto";
import {
  BaseError,
  LangfuseConflictError,
  ServiceUnavailableError,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import type { ApiAccessScope } from "@langfuse/shared/src/server";
import {
  escapeSlackMrkdwn,
  getProductBaseUrl,
  logger,
  recordIncrement,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import type {
  PostFeedbackBodyType,
  PostFeedbackResponseType,
} from "@/src/features/public-api/types/feedback";

export type FeedbackSource = "langfuse-mcp" | "in-app-assistant" | "public-api";

export type FeedbackReporter = {
  userId: string;
  email?: string | null;
};

type FeedbackContext = {
  projectId: string;
  orgId: string;
  orgName?: string;
  orgUrl?: string;
  projectName?: string;
  projectUrl?: string;
};

type FeedbackResource = {
  id: string;
  name?: string;
  url?: string;
};

type SlackTextObject = {
  type: "plain_text" | "mrkdwn";
  text: string;
  emoji?: boolean;
};

type SlackBlock =
  | {
      type: "header";
      text: SlackTextObject;
    }
  | {
      type: "section";
      text: SlackTextObject;
    }
  | {
      type: "section";
      fields: SlackTextObject[];
    }
  | {
      type: "divider";
    }
  | {
      type: "context";
      elements: SlackTextObject[];
    };

type SlackPayload = {
  text: string;
  blocks: SlackBlock[];
  unfurl_links: false;
  unfurl_media: false;
};

type FeedbackSlackMessage = SlackPayload;

const SLACK_SECTION_TEXT_LIMIT = 3000;
const SLACK_FIELD_TEXT_LIMIT = 2000;
const FEEDBACK_SLACK_TIMEOUT_MS = 5_000;

const truncateForSlack = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 14))}\n[truncated]`;
};

const plainText = (value: string, maxLength: number): SlackTextObject => ({
  type: "plain_text",
  text: truncateForSlack(value, maxLength),
  emoji: false,
});

const mrkdwnText = (value: string): SlackTextObject => ({
  type: "mrkdwn",
  text: value,
});

const appendPlainTextSection = (
  blocks: SlackBlock[],
  label: string,
  value: string | undefined,
) => {
  if (!value) return;

  blocks.push(
    {
      type: "section",
      text: mrkdwnText(`*${label}*`),
    },
    {
      type: "section",
      text: plainText(value, SLACK_SECTION_TEXT_LIMIT),
    },
  );
};

const getDataRegion = (): string =>
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ?? "self-hosted";

const feedbackSourceLabel: Record<FeedbackSource, string> = {
  "langfuse-mcp": "Langfuse MCP",
  "in-app-assistant": "In-app assistant",
  "public-api": "Public API",
};

const formatFeedbackReporterLabel = (
  reporter: FeedbackReporter | undefined,
): string | undefined => {
  if (!reporter) return undefined;

  const userId = reporter.userId.trim();
  const email = reporter.email?.trim();
  if (!userId) return email || undefined;
  return email ? `${userId} · ${email}` : userId;
};

const tryBuildProductUrl = (path: string): string | undefined => {
  try {
    return new URL(path.replace(/^\//, ""), getProductBaseUrl()).toString();
  } catch {
    return undefined;
  }
};

const formatResourceContextElement = (
  label: string,
  resource: FeedbackResource,
): SlackTextObject => {
  if (resource.name) {
    const name = escapeSlackMrkdwn(
      truncateForSlack(resource.name, SLACK_FIELD_TEXT_LIMIT),
    );
    const id = escapeSlackMrkdwn(resource.id);
    const identifier = resource.url ? `<${resource.url}|${id}>` : id;
    return mrkdwnText(
      truncateForSlack(
        `${label} ${name} · ${identifier}`,
        SLACK_FIELD_TEXT_LIMIT,
      ),
    );
  }

  return plainText(`${label} ${resource.id}`, SLACK_FIELD_TEXT_LIMIT);
};

const resolveFeedbackResources = async ({
  orgId,
  projectId,
}: {
  orgId: string;
  projectId: string;
}): Promise<{ org: FeedbackResource; project: FeedbackResource }> => {
  const shouldLookupProject = projectId !== "unknown";

  try {
    const [organization, project] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: orgId },
        select: { name: true },
      }),
      shouldLookupProject
        ? prisma.project.findFirst({
            where: { id: projectId, orgId },
            select: { name: true },
          })
        : Promise.resolve(null),
    ]);

    return {
      org: {
        id: orgId,
        ...(organization
          ? {
              name: organization.name,
              url: tryBuildProductUrl(
                `organization/${encodeURIComponent(orgId)}`,
              ),
            }
          : {}),
      },
      project: {
        id: projectId,
        ...(project
          ? {
              name: project.name,
              url: tryBuildProductUrl(
                `project/${encodeURIComponent(projectId)}`,
              ),
            }
          : {}),
      },
    };
  } catch (error) {
    logger.warn("Failed to resolve feedback org/project names", {
      orgId,
      projectId,
      error,
    });
    return {
      org: { id: orgId },
      project: { id: projectId },
    };
  }
};

const buildFeedbackSlackMessage = ({
  id,
  input,
  source,
  context,
  reporter,
}: {
  id: string;
  input: PostFeedbackBodyType;
  source: FeedbackSource;
  context: FeedbackContext;
  reporter?: FeedbackReporter;
}): FeedbackSlackMessage => {
  const reporterLabel = formatFeedbackReporterLabel(reporter);
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "💬 New Langfuse feedback",
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        plainText(
          `📬 SOURCE:\n${feedbackSourceLabel[source]}`,
          SLACK_FIELD_TEXT_LIMIT,
        ),
        ...(reporterLabel
          ? [
              plainText(
                `👤 REPORTER:\n${reporterLabel}`,
                SLACK_FIELD_TEXT_LIMIT,
              ),
            ]
          : []),
        plainText(`🎯 TARGET:\n${input.target}`, SLACK_FIELD_TEXT_LIMIT),
        plainText(
          `🧩 TARGET TYPE:\n${input.targetType}`,
          SLACK_FIELD_TEXT_LIMIT,
        ),
        plainText(`🌍 REGION:\n${getDataRegion()}`, SLACK_FIELD_TEXT_LIMIT),
      ],
    },
    { type: "divider" },
  ];

  appendPlainTextSection(blocks, "💬 Feedback:", input.feedback);
  appendPlainTextSection(blocks, "🎯 Goal / use case:", input.goal);
  appendPlainTextSection(blocks, "🔗 Reference URL:", input.referenceUrl);

  blocks.push(
    { type: "divider" },
    {
      type: "context",
      elements: [
        plainText(`🧾 Receipt: ${id}`, SLACK_FIELD_TEXT_LIMIT),
        formatResourceContextElement("🏢 Org:", {
          id: context.orgId,
          name: context.orgName,
          url: context.orgUrl,
        }),
        formatResourceContextElement("📁 Project:", {
          id: context.projectId,
          name: context.projectName,
          url: context.projectUrl,
        }),
      ],
    },
  );

  return {
    text: `New Langfuse feedback · ${feedbackSourceLabel[source]} · ${input.targetType} · ${id}`,
    blocks,
    unfurl_links: false,
    unfurl_media: false,
  };
};

// The HIPAA region must never deliver feedback to Slack, even if a webhook
// were configured there by mistake.
const getConfiguredFeedbackWebhookUrl = (): string | undefined =>
  env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION === "HIPAA"
    ? undefined
    : env.LANGFUSE_FEEDBACK_INTAKE_SLACK_WEBHOOK;

const validateFeedbackWebhookUrl = (webhookUrl: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(webhookUrl);
  } catch {
    throw new ServiceUnavailableError("Feedback Slack sink is misconfigured");
  }

  const requiresHttps = env.NODE_ENV === "production";
  const isInvalidCloudSink =
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION &&
    (parsed.protocol !== "https:" || parsed.hostname !== "hooks.slack.com");
  if ((requiresHttps && parsed.protocol !== "https:") || isInvalidCloudSink) {
    throw new ServiceUnavailableError("Feedback Slack sink is misconfigured");
  }

  return webhookUrl;
};

export const submitFeedback = async ({
  input,
  source,
  scope,
  reporter,
}: {
  input: PostFeedbackBodyType;
  source: FeedbackSource;
  scope: ApiAccessScope;
  reporter?: FeedbackReporter;
}): Promise<PostFeedbackResponseType> => {
  const rateLimitCheck = await RateLimitService.getInstance().rateLimitRequest(
    scope,
    "feedback",
  );
  if (rateLimitCheck?.isRateLimited()) {
    recordIncrement("langfuse.feedback.submission", 1, {
      source,
      outcome: "rate_limited",
    });
    throw new BaseError(
      "TooManyRequestsError",
      429,
      "Feedback rate limit exceeded",
      true,
    );
  }

  const configuredWebhookUrl = getConfiguredFeedbackWebhookUrl();
  if (!configuredWebhookUrl) {
    recordIncrement("langfuse.feedback.submission", 1, {
      source,
      outcome: "sink_unconfigured",
    });
    logger.warn("Feedback intake sink is not configured", {
      source,
      targetType: input.targetType,
      orgId: scope.orgId,
      projectId: scope.projectId,
      region: getDataRegion(),
    });
    throw new LangfuseConflictError(
      "Feedback submission is not configured for this deployment",
    );
  }

  const id = randomUUID();
  const webhookUrl = validateFeedbackWebhookUrl(configuredWebhookUrl);
  const { org, project } = await resolveFeedbackResources({
    orgId: scope.orgId,
    projectId: scope.projectId ?? "unknown",
  });
  const payload = buildFeedbackSlackMessage({
    id,
    input,
    source,
    reporter,
    context: {
      orgId: org.id,
      orgName: org.name,
      orgUrl: org.url,
      projectId: project.id,
      projectName: project.name,
      projectUrl: project.url,
    },
  });

  let response: Response;
  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(FEEDBACK_SLACK_TIMEOUT_MS),
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    recordIncrement("langfuse.feedback.submission", 1, {
      source,
      outcome: "sink_failed",
    });
    throw new ServiceUnavailableError("Feedback Slack sink request failed");
  }

  if (!response.ok) {
    recordIncrement("langfuse.feedback.submission", 1, {
      source,
      outcome: "sink_failed",
    });
    throw new ServiceUnavailableError("Feedback Slack sink rejected message");
  }

  recordIncrement("langfuse.feedback.submission", 1, {
    source,
    outcome: "accepted",
  });

  return { id };
};
