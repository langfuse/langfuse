import { randomUUID } from "node:crypto";
import {
  LangfuseConflictError,
  ServiceUnavailableError,
} from "@langfuse/shared";
import { logger, recordIncrement } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import type {
  PostFeedbackBodyType,
  PostFeedbackResponseType,
} from "@/src/features/public-api/types/feedback";
import { enforceFeedbackRateLimit } from "./FeedbackRateLimitService";

export type FeedbackSource =
  | "langfuse-docs-mcp"
  | "langfuse-mcp"
  | "public-api";

type FeedbackContext = {
  projectId: string;
  orgId: string;
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

export type FeedbackSlackMessage = SlackPayload;

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
  "langfuse-docs-mcp": "Langfuse Docs MCP",
  "langfuse-mcp": "Langfuse MCP",
  "public-api": "Public API",
};

export const buildFeedbackSlackMessage = ({
  id,
  input,
  source,
  context,
}: {
  id: string;
  input: PostFeedbackBodyType;
  source: FeedbackSource;
  context?: FeedbackContext;
}): FeedbackSlackMessage => {
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "New Langfuse feedback",
        emoji: false,
      },
    },
    {
      type: "section",
      fields: [
        plainText(
          `Source\n${feedbackSourceLabel[source]}`,
          SLACK_FIELD_TEXT_LIMIT,
        ),
        plainText(`Target type\n${input.targetType}`, SLACK_FIELD_TEXT_LIMIT),
        plainText(`Target\n${input.target}`, SLACK_FIELD_TEXT_LIMIT),
        plainText(`Intake region\n${getDataRegion()}`, SLACK_FIELD_TEXT_LIMIT),
      ],
    },
    { type: "divider" },
  ];

  appendPlainTextSection(blocks, "Feedback", input.feedback);
  appendPlainTextSection(blocks, "Goal / use case", input.goal);
  appendPlainTextSection(blocks, "Reference URL", input.referenceUrl);

  blocks.push({
    type: "context",
    elements: [
      plainText(`Feedback ID: ${id}`, SLACK_FIELD_TEXT_LIMIT),
      ...(context
        ? [
            plainText(`Org ID: ${context.orgId}`, SLACK_FIELD_TEXT_LIMIT),
            plainText(
              `Project ID: ${context.projectId}`,
              SLACK_FIELD_TEXT_LIMIT,
            ),
          ]
        : []),
    ],
  });

  return {
    text: `New Langfuse feedback ${id}`,
    blocks,
    unfurl_links: false,
    unfurl_media: false,
  };
};

const getFeedbackWebhookUrl = (): string => {
  const webhookUrl = env.LANGFUSE_FEEDBACK_INTAKE_SLACK_WEBHOOK;

  if (!webhookUrl) {
    throw new LangfuseConflictError(
      "Feedback submission is not configured for this deployment",
    );
  }

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
  context,
}: {
  input: PostFeedbackBodyType;
  source: FeedbackSource;
  context?: FeedbackContext;
}): Promise<PostFeedbackResponseType> => {
  await enforceFeedbackRateLimit({ source, orgId: context?.orgId });

  if (!env.LANGFUSE_FEEDBACK_INTAKE_SLACK_WEBHOOK) {
    recordIncrement("langfuse.feedback.submission", 1, {
      source,
      outcome: "sink_unconfigured",
    });
    logger.warn("Feedback intake sink is not configured", {
      source,
      targetType: input.targetType,
      ...(context
        ? { orgId: context.orgId, projectId: context.projectId }
        : {}),
      region: getDataRegion(),
    });
    throw new LangfuseConflictError(
      "Feedback submission is not configured for this deployment",
    );
  }

  const id = randomUUID();
  const webhookUrl = getFeedbackWebhookUrl();
  const payload = buildFeedbackSlackMessage({ id, input, source, context });

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
